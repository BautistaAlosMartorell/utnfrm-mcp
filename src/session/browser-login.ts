import { chromium, type BrowserContext, type Page } from 'playwright';
import { CAMPUS_ORIGIN, PATHS, SYSACAD_LOGIN_URL, WEBMAIL_URL } from '../config.js';
import { describeCliError } from '../client/friendly-errors.js';
import { SessionStore } from './session-store.js';

/**
 * Inicio de sesión con navegador visible, sin pasos manuales en la terminal: se abre el Campus, la persona
 * escribe su usuario y contraseña ahí (el MCP nunca los ve) y, apenas la propia página muestra que ya
 * entró, se guarda la sesión cifrada y la ventana se cierra sola.
 */
export type LoginInfo = { path: string; hasLogoutLink: boolean; hasPasswordField: boolean };

/** Se evalúa dentro de la página. Va como texto para que ningún empaquetador lo reescriba. */
export const PROBE_SCRIPT = `(() => ({
  path: location.pathname,
  hasLogoutLink: document.querySelector('a[href*="/login/logout.php"]') !== null,
  hasPasswordField: document.querySelector('input[type="password"]') !== null
}))()`;

/**
 * "Cerrar sesión" solo existe cuando hay un usuario identificado. No sirven ni la cookie de sesión (Moodle la
 * crea también para visitantes) ni el menú de usuario (en las páginas públicas muestra "Acceder").
 */
export function isLoggedIn(info: LoginInfo): boolean {
  return !info.path.includes('/login') && !info.hasPasswordField && info.hasLogoutLink;
}

const BANNER_SCRIPT = (origin: string) => `(() => {
  if (location.origin !== ${JSON.stringify(origin)}) return;
  const render = (text, ok) => {
    let box = document.getElementById('utn-mcp-banner');
    if (!box) {
      box = document.createElement('div');
      box.id = 'utn-mcp-banner';
      box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;max-width:92vw;padding:12px 18px;border-radius:12px;font:600 15px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.25);pointer-events:none;text-align:center';
      (document.body || document.documentElement).appendChild(box);
    }
    box.textContent = text;
    box.style.background = ok ? '#16a34a' : '#1d3a78';
    box.style.color = '#fff';
  };
  window.__utnMcpBanner = render;
  const start = () => render('Iniciá sesión acá con tu usuario y contraseña del Campus. No hace falta hacer nada más: esta ventana se cierra sola.', false);
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();`;

export interface BrowserLoginOptions {
  timeoutMs?: number;
  pollMs?: number;
  /** Tiempo para que Moodle termine de fijar sus cookies antes de guardar. */
  settleMs?: number;
  headless?: boolean;
  /** Abre también Autogestión en otra pestaña y espera su home; se guardan las cookies de las dos en una sola sesión. */
  sysacad?: boolean;
  sysacadLoginUrl?: string;
  /** Abre también el Webmail (Roundcube) en otra pestaña. */
  webmail?: boolean;
  webmailUrl?: string;
  /** Si se pasan, el formulario se completa solo (renovación automática); sin ellas la persona escribe en la ventana. */
  credentials?: { username: string; password: string };
  campusOrigin?: string;
  loginUrl?: string;
  onProgress?: (message: string) => void;
  /** Por defecto guarda la sesión cifrada del usuario; las pruebas inyectan otra. */
  save?: (state: Awaited<ReturnType<BrowserContext['storageState']>>) => Promise<void>;
  /** Solo para pruebas: prepara el contexto (rutas simuladas) antes de abrir la página. */
  prepare?: (context: BrowserContext) => Promise<void>;
}

export type BrowserLoginResult = { ok: boolean; message: string; reason?: 'saved' | 'timeout' | 'closed' | 'error' };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function probe(page: Page): Promise<LoginInfo | undefined> {
  try {
    return await page.evaluate(PROBE_SCRIPT) as LoginInfo;
  } catch {
    return undefined; // la página está navegando
  }
}

/** Autogestión (los enlaces del menú) y el Webmail (ya dentro del correo) pueden quedar abiertos en cualquier pestaña. */
const SITE_READY = {
  autogestion: (candidate: Page) => candidate.locator('a[href*="iRv"]').count().then(count => count > 0),
  webmail: (candidate: Page) => candidate.evaluate(() => (window as unknown as { rcmail?: { env?: { task?: string } } }).rcmail?.env?.task === 'mail')
};

async function siteOpen(context: BrowserContext, site: keyof typeof SITE_READY): Promise<boolean> {
  for (const candidate of context.pages()) {
    if (await SITE_READY[site](candidate).catch(() => false)) return true;
  }
  return false;
}

async function missingSites(context: BrowserContext, wanted: Array<keyof typeof SITE_READY>): Promise<string[]> {
  const missing: string[] = [];
  for (const site of wanted) if (!await siteOpen(context, site)) missing.push(site === 'webmail' ? 'Webmail' : 'Autogestión');
  return missing;
}

async function showBanner(page: Page, text: string): Promise<void> {
  await page.evaluate(`window.__utnMcpBanner && window.__utnMcpBanner(${JSON.stringify(text)}, true)`).catch(() => undefined);
}

async function defaultSave(state: Awaited<ReturnType<BrowserContext['storageState']>>): Promise<void> {
  await SessionStore.save(state);
  SessionStore.protectSessionFile();
}

export async function runBrowserLogin(options: BrowserLoginOptions = {}): Promise<BrowserLoginResult> {
  const origin = options.campusOrigin ?? CAMPUS_ORIGIN;
  const loginUrl = options.loginUrl ?? new URL(PATHS.login, origin).href;
  const timeoutMs = options.timeoutMs ?? 180_000;
  const pollMs = options.pollMs ?? 600;
  const settleMs = options.settleMs ?? 1500;
  const save = options.save ?? defaultSave;

  let browser;
  try {
    browser = await chromium.launch({ headless: options.headless ?? false });
  } catch (error) {
    return { ok: false, reason: 'error', message: describeCliError(error) };
  }

  try {
    const context = await browser.newContext({ acceptDownloads: false, locale: 'es-AR' });
    await context.addInitScript(BANNER_SCRIPT(origin));
    await options.prepare?.(context);
    const page = await context.newPage();
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const wanted: Array<keyof typeof SITE_READY> = [...(options.sysacad ? ['autogestion' as const] : []), ...(options.webmail ? ['webmail' as const] : [])];
    if (options.sysacad) await (await context.newPage()).goto(options.sysacadLoginUrl ?? SYSACAD_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    if (options.webmail) await (await context.newPage()).goto(options.webmailUrl ?? WEBMAIL_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
    if (options.credentials) {
      await page.fill('#username', options.credentials.username);
      await page.fill('#password', options.credentials.password);
      await page.click('#loginbtn');
    } else {
      options.onProgress?.('Esperando que inicies sesión en la ventana del navegador…');
    }

    let campusSeen = false;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (page.isClosed() || !browser.isConnected()) {
        return { ok: false, reason: 'closed', message: 'Se cerró la ventana antes de terminar de iniciar sesión. Volvé a intentarlo y esperá a que se cierre sola.' };
      }
      const info = await probe(page);
      if (options.credentials && !(info && isLoggedIn(info))) {
        // Nunca se insiste con una clave rechazada ni se intenta pasar un desafío de seguridad.
        const rejected = await page.locator('#loginerrormessage, .loginerrors').count().catch(() => 0);
        if (rejected > 0) return { ok: false, reason: 'error', message: 'El Campus rechazó el usuario o la contraseña guardados. Actualizalos con utn-mcp-mendoza setup-wizard.' };
        const challenge = await page.content().then(html => /cf-chl-|captcha-container|g-recaptcha/i.test(html), () => false);
        if (challenge) return { ok: false, reason: 'error', message: 'El Campus presentó un desafío de seguridad; iniciá sesión a mano con utn-mcp-mendoza login.' };
      }
      const missing = info && isLoggedIn(info) ? await missingSites(context, wanted) : [];
      if (info && isLoggedIn(info) && missing.length > 0) {
        const note = `Campus listo. Falta ${missing.join(' y ')}: iniciá sesión en la otra pestaña${missing.includes('Autogestión') ? ' y elegí tu legajo' : ''}.`;
        if (!campusSeen) options.onProgress?.(`✔ ${note}`);
        campusSeen = true;
        await showBanner(page, note);
      } else if (info && isLoggedIn(info)) {
        options.onProgress?.('✔ Detecté tu inicio de sesión.');
        // Se toma una copia enseguida (por si cierran la ventana) y otra tras unos instantes con las cookies finales.
        let state = await context.storageState();
        await showBanner(page, '✔ ¡Listo! Sesión guardada. Esta ventana se cierra sola.');
        await sleep(settleMs);
        state = await context.storageState().catch(() => state);
        await save(state);
        return { ok: true, reason: 'saved', message: 'Sesión guardada.' };
      }
      await sleep(pollMs);
    }
    if (campusSeen) {
      await save(await context.storageState());
      return { ok: true, reason: 'saved', message: 'Sesión del Campus guardada. Lo demás (Autogestión o Webmail) no se completó a tiempo: volvé a ejecutar login si lo necesitás.' };
    }
    return { ok: false, reason: 'timeout', message: 'No se completó el inicio de sesión a tiempo. Volvé a intentarlo.' };
  } catch (error) {
    return { ok: false, reason: 'error', message: describeCliError(error) };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
