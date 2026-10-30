import { installChromium } from '../cli/install-browser.js';
import { browserInstalled } from './browser.js';
import { CredentialStore } from './credential-store.js';
import { SessionStore } from './session-store.js';
import { runBrowserLogin, type BrowserLoginResult } from './browser-login.js';

/** Dos sitios para entrar a mano: más tiempo que con el Campus solo. */
const LOGIN_TIMEOUT_MS = 300_000;

/**
 * Inicio de sesión desde la terminal. No pide pulsar Enter ni volver a la terminal: se abre el Campus,
 * la persona ingresa ahí y, apenas la página confirma que entró, la sesión se guarda y la ventana se cierra.
 * Si falta el navegador, se instala solo.
 */
export async function loginInteractive(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('   UTN MCP Mendoza — Inicio de Sesión en Campus FRM   ');
  console.log('======================================================\n');

  if (!browserInstalled()) {
    console.log('Falta el navegador que se usa para iniciar sesión. Lo instalo ahora (unos 150 MB; puede tardar un par de minutos)…\n');
    const status = installChromium();
    if (status !== 0 || !browserInstalled()) {
      console.error('\n[Error] No se pudo instalar el navegador. Probá: utn-mcp-mendoza install-browser (en Linux, si Chromium no abre por falta de bibliotecas: utn-mcp-mendoza install-deps).');
      return false;
    }
    console.log('\n✔ Navegador instalado.\n');
  }

  console.log('Se va a abrir una ventana con tres pestañas: el Campus, Autogestión y el Webmail.');
  console.log('1. Escribí tu usuario y contraseña en cada una (este programa nunca los ve; si guardaste credenciales con setup-wizard, el Campus se renueva solo y el correo usa IMAP).');
  console.log('2. En Autogestión elegí tu legajo. La ventana se cierra sola cuando entrás a las dos.\n');

  const result = await runBrowserLogin({ sysacad: true, webmail: true, timeoutMs: LOGIN_TIMEOUT_MS, onProgress: message => console.log(message) });
  if (!result.ok) {
    console.error(`\n[Error] ${result.message}`);
    return false;
  }
  console.log('\n[Éxito] Sesión guardada de forma segura en tu equipo. No la compartas ni la agregues a Git.');
  console.log('Ya podés usar el MCP desde tu cliente de IA.\n');
  return true;
}

/** Inicio de sesión desde el cliente de IA (herramienta start_login): igual que el anterior, sin consola. */
export async function loginInBackground(timeoutMs = LOGIN_TIMEOUT_MS): Promise<BrowserLoginResult> {
  return runBrowserLogin({ sysacad: true, webmail: true, timeoutMs });
}

type StorageState = Awaited<ReturnType<import('playwright').BrowserContext['storageState']>>;

/** La renovación headless solo ve el Campus: se conservan las cookies ya guardadas de Autogestión y Webmail. */
export function mergeStorageState(previous: StorageState | string | undefined, fresh: StorageState): StorageState {
  if (!previous || typeof previous === 'string') return fresh;
  const key = (cookie: { name: string; domain: string; path: string }) => `${cookie.domain}|${cookie.path}|${cookie.name}`;
  const renewed = new Set(fresh.cookies.map(key));
  const origins = new Set(fresh.origins.map(entry => entry.origin));
  return {
    cookies: [...previous.cookies.filter(cookie => !renewed.has(key(cookie))), ...fresh.cookies],
    origins: [...previous.origins.filter(entry => !origins.has(entry.origin)), ...fresh.origins]
  };
}

async function saveMerged(fresh: StorageState): Promise<void> {
  const previous = SessionStore.exists() ? await SessionStore.getPlaywrightStorageState().catch(() => undefined) : undefined;
  await SessionStore.save(mergeStorageState(previous, fresh));
  SessionStore.protectSessionFile();
}

let autoLoginInFlight: Promise<boolean> | undefined;

/**
 * Renueva la sesión del Campus con las credenciales guardadas (si las hay), sin ventana. Un solo intento a la vez;
 * `false` si no hay credenciales, el navegador falta o el Campus rechaza el acceso: ahí queda el login manual.
 */
export function autoLogin(timeoutMs = 60_000): Promise<boolean> {
  autoLoginInFlight ??= (async () => {
    try {
      const credentials = await CredentialStore.get();
      if (!credentials || !browserInstalled()) return false;
      return (await runBrowserLogin({ headless: true, credentials, timeoutMs, save: saveMerged })).ok;
    } catch {
      return false;
    }
  })().finally(() => { autoLoginInFlight = undefined; });
  return autoLoginInFlight;
}
