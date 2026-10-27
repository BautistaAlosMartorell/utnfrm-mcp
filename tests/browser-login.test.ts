import fs from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import { isLoggedIn, runBrowserLogin } from '../src/session/browser-login.js';

const ORIGIN = 'https://campusvirtual.frm.utn.edu.ar';
const hasBrowser = (() => { try { return fs.existsSync(chromium.executablePath()); } catch { return false; } })();

describe('isLoggedIn', () => {
  it('needs the "Cerrar sesión" link and no login form', () => {
    expect(isLoggedIn({ path: '/', hasLogoutLink: true, hasPasswordField: false })).toBe(true);
    expect(isLoggedIn({ path: '/my/', hasLogoutLink: true, hasPasswordField: false })).toBe(true);
    expect(isLoggedIn({ path: '/login/index.php', hasLogoutLink: true, hasPasswordField: false })).toBe(false);
    expect(isLoggedIn({ path: '/', hasLogoutLink: false, hasPasswordField: false })).toBe(false); // visitante: solo "Acceder"
    expect(isLoggedIn({ path: '/', hasLogoutLink: true, hasPasswordField: true })).toBe(false);
  });
});

/** Un Moodle mínimo: página de acceso, envío del formulario y páginas con o sin "Cerrar sesión". */
function fakeMoodle(options: { landing?: string; neverAccepts?: boolean } = {}) {
  const state = { loggedIn: false };
  const landing = options.landing ?? '/';
  return {
    state,
    prepare: async (context: BrowserContext) => {
      // Nada de la prueba sale a la red: cualquier otra dirección se bloquea.
      await context.route(url => new URL(url).origin !== ORIGIN, route => route.abort());
      await context.route(`${ORIGIN}/**`, async route => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === '/login/index.php' && request.method() === 'POST') {
          state.loggedIn = !options.neverAccepts;
          // Moodle redirige tras el acceso. Se simula con una navegación de la propia página: Playwright no vuelve a
          // interceptar las redirecciones HTTP entregadas por route.fulfill y la prueba saldría a la red real.
          const next = options.neverAccepts ? '/login/index.php' : landing;
          return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'set-cookie': 'MoodleSession=abc; Path=/' }, body: `<html><body><script>location.replace(${JSON.stringify(next)})</script></body></html>` });
        }
        if (url.pathname === '/login/index.php') {
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body><form method="post" action="/login/index.php"><input id="username" name="username"><input id="password" name="password" type="password"><button id="loginbtn" type="submit">Acceder</button></form></body></html>' });
        }
        const body = state.loggedIn
          ? '<html><body><div class="usermenu">Alumno</div><a href="/login/logout.php?sesskey=abc">Cerrar sesión</a><h1>Inicio</h1></body></html>'
          : '<html><body><div class="usermenu">Usted no se ha identificado (<a href="/login/index.php">Acceder</a>)</div></body></html>';
        return route.fulfill({ status: 200, contentType: 'text/html', body });
      });
    }
  };
}

/** Hace lo que haría una persona: escribe en el formulario y lo envía. */
async function typeCredentialsAndSubmit(page: Page): Promise<void> {
  await page.waitForSelector('#username');
  await page.fill('#username', 'alumno');
  await page.fill('#password', 'no-es-una-clave-real');
  await page.click('#loginbtn');
}

describe.skipIf(!hasBrowser)('runBrowserLogin (Moodle simulado, sin teclado ni terminal)', () => {
  it.each(['/', '/my/', '/course/view.php?id=7'])('detects the login by itself when Moodle lands on %s and saves once', async landing => {
    const site = fakeMoodle({ landing });
    const save = vi.fn(async () => undefined);
    const progress: string[] = [];
    const result = await runBrowserLogin({
      headless: true, pollMs: 100, settleMs: 100, timeoutMs: 20_000, save,
      onProgress: message => progress.push(message),
      prepare: async context => {
        await site.prepare(context);
        context.on('page', page => { void typeCredentialsAndSubmit(page); });
      }
    });
    expect(result).toMatchObject({ ok: true, reason: 'saved' });
    expect(save).toHaveBeenCalledTimes(1);
    const state = (save.mock.calls[0] as unknown as [{ cookies: Array<{ name: string }> }])[0];
    expect(state.cookies.map(cookie => cookie.name)).toContain('MoodleSession');
    expect(progress.join(' ')).toMatch(/Detecté tu inicio de sesión/);
  }, 40_000);

  it('shows on-screen instructions in the login page so nobody has to guess', async () => {
    const site = fakeMoodle();
    let banner = '';
    const result = await runBrowserLogin({
      headless: true, pollMs: 100, timeoutMs: 3000, save: async () => undefined,
      prepare: async context => {
        await site.prepare(context);
        context.on('page', page => {
          void (async () => {
            await page.waitForSelector('#utn-mcp-banner');
            banner = (await page.textContent('#utn-mcp-banner')) ?? '';
          })().catch(() => undefined);
        });
      }
    });
    expect(result.reason).toBe('timeout');
    expect(banner).toMatch(/Iniciá sesión acá/);
    expect(banner).toMatch(/se cierra sola/);
  }, 30_000);

  it('does not mistake a guest page ("Acceder") for a logged-in user', async () => {
    const site = fakeMoodle({ neverAccepts: true });
    const save = vi.fn(async () => undefined);
    const result = await runBrowserLogin({
      headless: true, pollMs: 100, timeoutMs: 3500, save,
      prepare: async context => {
        await site.prepare(context);
        context.on('page', page => { void typeCredentialsAndSubmit(page).catch(() => undefined); });
      }
    });
    expect(result).toMatchObject({ ok: false, reason: 'timeout' });
    expect(save).not.toHaveBeenCalled();
  }, 30_000);

  it('reports a window closed before finishing, without saving anything', async () => {
    const site = fakeMoodle();
    const save = vi.fn(async () => undefined);
    const result = await runBrowserLogin({
      headless: true, pollMs: 100, timeoutMs: 20_000, save,
      prepare: async context => {
        await site.prepare(context);
        context.on('page', page => { void page.waitForSelector('#username').then(() => page.close()).catch(() => undefined); });
      }
    });
    expect(result).toMatchObject({ ok: false, reason: 'closed' });
    expect(result.message).toMatch(/Se cerró la ventana/);
    expect(save).not.toHaveBeenCalled();
  }, 30_000);

  it('turns a failing save into an error instead of pretending it worked', async () => {
    const site = fakeMoodle();
    const result = await runBrowserLogin({
      headless: true, pollMs: 100, settleMs: 50, timeoutMs: 20_000,
      save: async () => { throw new Error('No esta disponible el almacen seguro de sesiones del sistema.'); },
      prepare: async context => {
        await site.prepare(context);
        context.on('page', page => { void typeCredentialsAndSubmit(page); });
      }
    });
    expect(result).toMatchObject({ ok: false, reason: 'error' });
    expect(result.message).toMatch(/almac[eé]n seguro/i);
  }, 40_000);
});
