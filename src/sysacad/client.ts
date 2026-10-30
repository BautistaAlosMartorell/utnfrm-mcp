import { chromium, type Browser, type Page } from 'playwright';
import { SYSACAD_HOME_URL, SYSACAD_LOGIN_URL } from '../config.js';
import { CredentialStore } from '../session/credential-store.js';
import { SessionStore } from '../session/session-store.js';
import { CONSULTAS, type ConsultaName } from './consultas.js';

const NAV_TIMEOUT_MS = 30_000;
const SETTLE_TIMEOUT_MS = 90_000;
const IDLE_CLOSE_MS = 5 * 60_000;

class SessionExpiredError extends Error {
  constructor() { super('La sesión de Autogestión venció. Ejecutá utn-mcp-mendoza login (o guardá credenciales con utn-mcp-mendoza setup-wizard para renovarla sola).'); }
}

/**
 * Cliente de Autogestion (Sysacad). El sitio es ASP clasico con JavaScript: se maneja con un Chromium sin
 * pantalla. Entra con las credenciales UTN guardadas o, si no hay, con las cookies de `utn-mcp-mendoza login`. Solo hace las consultas de solo lectura de `CONSULTAS`;
 * ninguna inscripcion ni formulario de escritura. Una sola pagina compartida, por eso se serializa.
 */
export class SysacadClient {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private homeUrl: string | null = null;
  private legajo: string | undefined;
  /** Sesión armada con las cookies de `login` (no con credenciales): si venció, no hay con qué renovarla. */
  private cookieMode = false;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | undefined;

  async consultar(name: ConsultaName, legajo?: string): Promise<string> {
    const consulta = CONSULTAS[name];
    return this.run(legajo, async (page, home) => {
      if (consulta.kind === 'ver') {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
          page.evaluate(([action, t, p]) => (window as unknown as { iRf: (a: string, t: string, p: string) => void }).iRf(action, t, p), ['ver.frc', consulta.t, consulta.p])
        ]);
        if (await this.isLoginPage(page)) throw new SessionExpiredError();
        return page.content();
      }
      const query = 'query' in consulta ? consulta.query : '';
      return this.settle(page, new URL(`transacciones/manpet.frc?t=${consulta.t}&ingreso=0${query}`, home).href);
    });
  }

  /** Pantalla de inscripcion a cursado (t=502). Solo se mira: no se hace clic en materias ni comisiones. */
  async inscripcionHtml(legajo?: string): Promise<string> {
    return this.run(legajo, (page, home) => this.settle(page, new URL('transacciones/manpet.frc?t=502&ingreso=0', home).href));
  }

  /** Inicia sesión (o reutiliza la abierta) sin consultar nada. */
  async verifyLogin(legajo?: string): Promise<void> {
    await this.run(legajo, async () => undefined);
  }

  async close(): Promise<void> {
    clearTimeout(this.idleTimer);
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    this.homeUrl = null;
    this.cookieMode = false;
    await browser?.close().catch(() => null);
  }

  private run<T>(legajo: string | undefined, action: (page: Page, home: string) => Promise<T>): Promise<T> {
    const task = async (): Promise<T> => {
      clearTimeout(this.idleTimer);
      try {
        // Como mucho dos inicios de sesion por consulta (el segundo, si la sesion vencio): nunca se insiste con una clave rechazada.
        for (let attempt = 0; ; attempt++) {
          if (legajo && legajo !== this.legajo) await this.close();
          const page = await this.session(legajo);
          try {
            await page.goto(this.homeUrl!, { waitUntil: 'domcontentloaded' });
            if (await this.isLoginPage(page)) throw new SessionExpiredError();
            return await action(page, this.homeUrl!);
          } catch (error) {
            if (!(error instanceof SessionExpiredError)) throw error;
            const retry = attempt === 0 && !this.cookieMode;
            await this.close();
            if (!retry) throw error;
          }
        }
      } finally {
        this.idleTimer = setTimeout(() => { void this.close(); }, IDLE_CLOSE_MS);
        this.idleTimer.unref();
      }
    };
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async session(legajo?: string): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    const credentials = await CredentialStore.get();
    if (!credentials) return this.sessionFromCookies();

    await this.close();
    this.browser = await chromium.launch({ headless: true });
    try {
      const page = await (await this.browser.newContext({ acceptDownloads: false })).newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);
      await page.goto(SYSACAD_LOGIN_URL, { waitUntil: 'domcontentloaded' });
      await page.fill('[name="username"]', credentials.username);
      await page.fill('[name="password"]', credentials.password);
      await page.evaluate(() => (document.querySelector('[type="submit"]') as HTMLElement | null)?.click());

      const buttons = page.locator('[value^="Legajo:"]');
      try { await buttons.first().waitFor(); }
      catch { throw new Error('No se pudo iniciar sesión en Autogestión: usuario o contraseña incorrectos, o el sitio no responde.'); }

      const values = await buttons.evaluateAll(elements => elements.map(element => (element as HTMLInputElement).value));
      const index = legajo
        ? values.findIndex(value => value.includes(`Legajo: ${legajo} `))
        : values.findIndex(value => /Alumno/i.test(value));
      if (index < 0) throw new Error(legajo ? `No encontré el legajo ${legajo} entre los de tu cuenta.` : 'No encontré un legajo de alumno en tu cuenta de Autogestión.');
      await buttons.nth(index).evaluate(element => (element as HTMLElement).click());

      await page.waitForSelector('a[href*="iRv"]');
      this.homeUrl = page.url();
      this.legajo = legajo;
      this.page = page;
      return page;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  /** Sin credenciales: se reusan las cookies guardadas por `login`. El legajo ya quedó elegido en esa sesión. */
  private async sessionFromCookies(): Promise<Page> {
    if (!SessionStore.exists()) throw new Error('Faltan las credenciales UTN. Ejecutá utn-mcp-mendoza setup-wizard para guardarlas, o utn-mcp-mendoza login para iniciar sesión sin guardarlas.');
    await this.close();
    this.browser = await chromium.launch({ headless: true });
    try {
      const context = await this.browser.newContext({ acceptDownloads: false, storageState: await SessionStore.getPlaywrightStorageState() });
      const page = await context.newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);
      this.homeUrl = SYSACAD_HOME_URL;
      this.legajo = undefined;
      this.cookieMode = true;
      this.page = page;
      return page;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  private async isLoginPage(page: Page): Promise<boolean> {
    // El home tiene campos "username" y "password" ocultos: solo el login los muestra.
    return /login\.php/i.test(page.url()) || await page.locator('[name="username"]:visible').count() > 0;
  }

  /** Las pantallas "manpet" pasan por varias paginas de espera con meta-refresh antes de mostrar el resultado. */
  private async settle(page: Page, url: string): Promise<string> {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.isLoginPage(page)) throw new SessionExpiredError();
      if (!(await this.isWaiting(page))) return page.content();
      await page.waitForTimeout(1500);
    }
    throw new Error('Autogestión no terminó de cargar la consulta a tiempo.');
  }

  private async isWaiting(page: Page): Promise<boolean> {
    try {
      const text = (await page.innerText('body')).trim();
      if (/Espere por favor/i.test(text) || /^Listando [^.]*\.\.\.$/i.test(text)) return true;
      return await page.locator('meta[http-equiv="refresh" i]').count() > 0;
    } catch {
      return true; // la pagina estaba navegando mientras se la leia
    }
  }
}

export const sysacadClient = new SysacadClient();
