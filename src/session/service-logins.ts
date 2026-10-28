import { describeCliError } from '../client/friendly-errors.js';
import { verifyMail } from '../mail/backend.js';
import { sysacadClient } from '../sysacad/client.js';
import { CredentialStore, type UtnCredentials } from './credential-store.js';
import { SessionStore } from './session-store.js';

export type ServiceName = 'correo' | 'autogestion';
export type ServiceLogin = { status: 'ok' | 'fail' | 'skip'; detail: string };

export interface ServiceLoginDeps {
  credentials: () => Promise<UtnCredentials | null>;
  verifyMail: () => Promise<void>;
  verifyAutogestion: () => Promise<void>;
  /** ¿`login` guardó cookies de ese servicio? Permite usarlo sin credenciales. */
  hasSession: (service: ServiceName) => Promise<boolean>;
}

const COOKIE_OF: Record<ServiceName, (cookie: { domain: string; name: string }) => boolean> = {
  correo: cookie => cookie.name === 'roundcube_sessid',
  autogestion: cookie => cookie.domain.includes('autogestion') || cookie.domain.includes('sysacad')
};

async function savedCookieFor(service: ServiceName): Promise<boolean> {
  try {
    if (!SessionStore.exists()) return false;
    const state = await SessionStore.getPlaywrightStorageState();
    return typeof state !== 'string' && state.cookies.some(COOKIE_OF[service]);
  } catch {
    return false;
  }
}

export const defaultServiceLoginDeps: ServiceLoginDeps = {
  credentials: () => CredentialStore.get(),
  verifyMail,
  verifyAutogestion: () => sysacadClient.verifyLogin(),
  hasSession: savedCookieFor
};

/**
 * Cada servicio anda con credenciales guardadas o con las cookies de `login`. Sin ninguna de las dos: "skip", no es una falla.
 * `verify: false` no consulta nada; `browser: false` evita lo que abre Chromium (solo queda el IMAP, que es liviano).
 */
export async function checkServiceLogin(
  service: ServiceName,
  deps: ServiceLoginDeps,
  options: { verify: boolean; browser: boolean }
): Promise<ServiceLogin> {
  try {
    const credentials = await deps.credentials();
    if (!credentials && !await deps.hasSession(service)) return { status: 'skip', detail: 'sin credenciales ni sesión de login guardadas' };
    const light = service === 'correo' && Boolean(credentials?.email);
    if (!options.verify || (!light && !options.browser)) return { status: 'skip', detail: 'guardado; no se verificó (usá utn-mcp-mendoza doctor)' };
    await (service === 'correo' ? deps.verifyMail() : deps.verifyAutogestion());
    return { status: 'ok', detail: credentials ? 'el acceso con las credenciales guardadas funciona' : 'la sesión guardada por login funciona' };
  } catch (error) {
    return { status: 'fail', detail: describeCliError(error) };
  }
}
