import { CredentialStore } from '../session/credential-store.js';
import { SessionStore } from '../session/session-store.js';
import * as imap from './client.js';
import { webmailClient } from './webmail-client.js';

export type { MailMessage, MailSearchHit, MailSummary } from './client.js';

type Backend = Pick<typeof imap, 'listMessages' | 'searchMessages' | 'readMessage' | 'moveToTrash' | 'restoreFromTrash' | 'setSeen'> & { verify: () => Promise<void> };

const imapBackend: Backend = { ...imap, verify: imap.verifyMailLogin };
const webmailBackend: Backend = {
  listMessages: o => webmailClient.listMessages(o),
  searchMessages: o => webmailClient.searchMessages(o),
  readMessage: o => webmailClient.readMessage(o),
  moveToTrash: o => webmailClient.moveToTrash(o),
  restoreFromTrash: o => webmailClient.restoreFromTrash(o),
  setSeen: o => webmailClient.setSeen(o),
  verify: () => webmailClient.verify()
};

const NO_ACCESS = 'No hay cómo entrar al correo. Guardá tu correo y contraseña con utn-mcp-mendoza setup-wizard (IMAP) o iniciá sesión con utn-mcp-mendoza login (Webmail).';

/**
 * IMAP si hay credenciales con correo; si el servidor las rechaza y hay una sesión de login guardada, sigue por el Webmail.
 * Sin credenciales, va directo al Webmail. El Webmail se prueba solo si hay cookies guardadas.
 */
async function withBackend<T>(operation: (backend: Backend) => Promise<T>): Promise<T> {
  const credentials = await CredentialStore.get();
  const hasCookies = (() => { try { return SessionStore.exists(); } catch { return false; } })();
  if (credentials?.email) {
    try { return await operation(imapBackend); }
    catch (error) { if (!(error instanceof imap.MailAuthError) || !hasCookies) throw error; }
  } else if (!hasCookies) {
    throw new Error(NO_ACCESS);
  }
  return operation(webmailBackend);
}

export const listMessages: Backend['listMessages'] = options => withBackend(b => b.listMessages(options));
export const searchMessages: Backend['searchMessages'] = options => withBackend(b => b.searchMessages(options));
export const readMessage: Backend['readMessage'] = options => withBackend(b => b.readMessage(options));
export const moveToTrash: Backend['moveToTrash'] = options => withBackend(b => b.moveToTrash(options));
export const restoreFromTrash: Backend['restoreFromTrash'] = options => withBackend(b => b.restoreFromTrash(options));
export const setSeen: Backend['setSeen'] = options => withBackend(b => b.setSeen(options));
export const verifyMail = (): Promise<void> => withBackend(b => b.verify());
