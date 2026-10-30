import { ImapFlow, type FetchMessageObject, type SearchObject } from 'imapflow';
import { CredentialStore } from '../session/credential-store.js';
import { decodeBody, describeStructure, formatAddress, type MailAttachment } from './message.js';

/** Único servidor al que se envía la contraseña, siempre por TLS con el certificado verificado. */
export const MAIL_HOST = 'alumnos.frm.utn.edu.ar';
const MAX_BODY_BYTES = 200_000;
const MAX_TEXT_CHARS = 20_000;

export type MailSummary = { uid: number; from: string; subject: string; date?: string; seen: boolean };
export type MailSearchHit = MailSummary & { folder: string };
export type MailMessage = MailSummary & { to: string; text: string; truncated: boolean; attachments: MailAttachment[] };
export type MailSearchCriteria = { from?: string; to?: string; subject?: string; text?: string; since?: string; before?: string; unseenOnly: boolean };

const iso = (date: Date | string | undefined) => (date instanceof Date ? date.toISOString() : date);
const newestFirst = (a: MailSummary, b: MailSummary) => (b.date ?? '').localeCompare(a.date ?? '');

function summarize(message: FetchMessageObject): MailSummary {
  const date = iso(message.envelope?.date);
  return {
    uid: message.uid,
    from: formatAddress(message.envelope?.from?.[0]),
    subject: message.envelope?.subject ?? '',
    ...(date ? { date } : {}),
    seen: message.flags?.has('\\Seen') ?? false
  };
}

/** Credenciales rechazadas por el servidor de correo (distinto de "no hay conexión"): habilita el respaldo por Webmail. */
export class MailAuthError extends Error {}

/** Una conexión por operación. Los mensajes son contenido externo no confiable. */
async function withClient<T>(operation: (client: ImapFlow) => Promise<T>): Promise<T> {
  const credentials = await CredentialStore.get();
  if (!credentials?.email) throw new Error('Falta el correo institucional. Ejecutá utn-mcp-mendoza setup-wizard para guardarlo junto con tu contraseña.');

  const client = new ImapFlow({ host: MAIL_HOST, port: 993, secure: true, auth: { user: credentials.email, pass: credentials.password }, logger: false });
  client.on('error', () => undefined); // los fallos llegan por las llamadas que se esperan
  try { await client.connect(); }
  catch (error) {
    client.close();
    if ((error as { authenticationFailed?: boolean }).authenticationFailed) throw new MailAuthError('No se pudo iniciar sesión en el correo: usuario o contraseña incorrectos.');
    throw new Error('No se pudo conectar con el servidor de correo de la facultad.');
  }
  try { return await operation(client); }
  finally { await client.logout().catch(() => client.close()); }
}

/** Abre la carpeta; `readOnly` (EXAMINE) garantiza que no se marque ni cambie nada. */
async function inFolder<T>(client: ImapFlow, folder: string, readOnly: boolean, operation: () => Promise<T>): Promise<T> {
  const lock = await client.getMailboxLock(folder, { readOnly }).catch(() => { throw new Error(`No existe la carpeta "${folder}" en el correo (las habituales son INBOX, Sent, Drafts y Trash).`); });
  try { return await operation(); } finally { lock.release(); }
}

/** Abre y cierra una conexión: confirma que las credenciales guardadas entran al correo. */
export function verifyMailLogin(): Promise<void> {
  return withClient(async () => undefined);
}

export function listMessages(options: { folder: string; limit: number; unseenOnly: boolean }): Promise<MailSummary[]> {
  return withClient(client => inFolder(client, options.folder, true, async () => {
    const total = client.mailbox ? client.mailbox.exists : 0;
    let range: string;
    if (options.unseenOnly) {
      const uids = (await client.search({ seen: false }, { uid: true })) || [];
      if (uids.length === 0) return [];
      range = uids.slice(-options.limit).join(',');
    } else {
      if (total === 0) return [];
      range = `${Math.max(1, total - options.limit + 1)}:*`;
    }
    const messages: MailSummary[] = [];
    for await (const message of client.fetch(range, { uid: true, envelope: true, flags: true }, { uid: options.unseenOnly })) messages.push(summarize(message));
    return messages.sort(newestFirst);
  }));
}

/** Busca con todos los criterios a la vez (se combinan con "y") en las carpetas indicadas, o en todas. */
export function searchMessages(options: MailSearchCriteria & { folders?: string[]; limit: number }): Promise<MailSearchHit[]> {
  const query: SearchObject = {
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
    ...(options.subject ? { subject: options.subject } : {}),
    ...(options.text ? { text: options.text } : {}),
    ...(options.since ? { since: options.since } : {}),
    ...(options.before ? { before: options.before } : {}),
    ...(options.unseenOnly ? { seen: false } : {})
  };
  if (Object.keys(query).length === 0) return Promise.reject(new Error('Indicá al menos un criterio de búsqueda (from, to, subject, text, since, before o unseen_only).'));

  return withClient(async client => {
    const folders = options.folders?.length
      ? options.folders
      : (await client.list()).filter(box => !box.flags?.has('\\Noselect')).map(box => box.path);
    const hits: MailSearchHit[] = [];
    for (const folder of folders) {
      await inFolder(client, folder, true, async () => {
        const uids = (await client.search(query, { uid: true })) || [];
        if (uids.length === 0) return;
        for await (const message of client.fetch(uids.slice(-options.limit).join(','), { uid: true, envelope: true, flags: true }, { uid: true })) hits.push({ folder, ...summarize(message) });
      });
    }
    return hits.sort(newestFirst).slice(0, options.limit);
  });
}

export function readMessage(options: { folder: string; uid: number }): Promise<MailMessage> {
  return withClient(client => inFolder(client, options.folder, true, async () => {
    const message = await client.fetchOne(String(options.uid), { uid: true, envelope: true, flags: true, bodyStructure: true }, { uid: true });
    if (!message) throw new Error(`No existe el mensaje ${options.uid} en ${options.folder}.`);

    const { body, attachments } = describeStructure(message.bodyStructure);
    let text = '';
    if (body) {
      const download = await client.download(String(options.uid), body.part, { uid: true, maxBytes: MAX_BODY_BYTES });
      if (download.content) {
        const chunks: Buffer[] = [];
        for await (const chunk of download.content) chunks.push(Buffer.from(chunk));
        text = decodeBody(Buffer.concat(chunks), body);
      }
    }
    return {
      ...summarize(message),
      to: (message.envelope?.to ?? []).map(formatAddress).join(', '),
      text: text.slice(0, MAX_TEXT_CHARS),
      truncated: text.length > MAX_TEXT_CHARS,
      attachments
    };
  }));
}

/** Mueve mensajes entre carpetas y devuelve cuáles encontró. Los que no existen se informan, no fallan. */
async function moveBetween(client: ImapFlow, folder: string, destination: string, uids: number[], refused: string): Promise<{ moved: MailSummary[]; notFound: number[] }> {
  return inFolder(client, folder, false, async () => {
    const found: MailSummary[] = [];
    for await (const message of client.fetch(uids.join(','), { uid: true, envelope: true, flags: true }, { uid: true })) found.push(summarize(message));
    if (found.length === 0) throw new Error(`No encontré ninguno de esos mensajes en ${folder}.`);
    if (!(await client.messageMove(found.map(message => message.uid).join(','), destination, { uid: true }))) throw new Error(refused);
    return { moved: found, notFound: uids.filter(uid => !found.some(message => message.uid === uid)) };
  });
}

const findTrash = async (client: ImapFlow) => (await client.list()).find(box => box.specialUse === '\\Trash')?.path ?? 'Trash';

/**
 * "Borrar" = mover a la Papelera, que se puede deshacer. No hay borrado definitivo: ni vaciar la Papelera
 * ni EXPUNGE. Devuelve qué se movió para poder revisarlo o recuperarlo con restoreFromTrash.
 */
export function moveToTrash(options: { folder: string; uids: number[] }): Promise<{ trash: string; moved: MailSummary[]; notFound: number[] }> {
  return withClient(async client => {
    const trash = await findTrash(client);
    if (options.folder.toLowerCase() === trash.toLowerCase()) throw new Error('Esos mensajes ya están en la Papelera. El borrado definitivo no está habilitado: vaciala desde el webmail.');
    return { trash, ...(await moveBetween(client, options.folder, trash, options.uids, 'El servidor no pudo mover los mensajes a la Papelera.')) };
  });
}

/** Deshace moveToTrash: saca mensajes de la Papelera y los pone en `to` (IMAP no guarda la carpeta de origen). */
export function restoreFromTrash(options: { uids: number[]; to: string }): Promise<{ from: string; to: string; moved: MailSummary[]; notFound: number[] }> {
  return withClient(async client => {
    const trash = await findTrash(client);
    if (options.to.toLowerCase() === trash.toLowerCase()) throw new Error('El destino no puede ser la Papelera.');
    if (!(await client.list()).some(box => box.path === options.to)) throw new Error(`No existe la carpeta "${options.to}" en el correo (las habituales son INBOX, Sent y Drafts).`);
    return { from: trash, to: options.to, ...(await moveBetween(client, trash, options.to, options.uids, 'El servidor no pudo restaurar los mensajes.')) };
  });
}

/** Marca como leídos o no leídos (solo el flag \\Seen; no toca nada más del mensaje). */
export function setSeen(options: { folder: string; uids: number[]; seen: boolean }): Promise<{ updated: MailSummary[]; notFound: number[] }> {
  return withClient(client => inFolder(client, options.folder, false, async () => {
    const found: MailSummary[] = [];
    for await (const message of client.fetch(options.uids.join(','), { uid: true, envelope: true, flags: true }, { uid: true })) found.push(summarize(message));
    if (found.length === 0) throw new Error(`No encontré ninguno de esos mensajes en ${options.folder}.`);
    const uids = found.map(message => message.uid).join(',');
    const changed = options.seen ? await client.messageFlagsAdd(uids, ['\\Seen'], { uid: true }) : await client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
    if (!changed && found.some(message => message.seen !== options.seen)) throw new Error('El servidor no pudo cambiar el estado de lectura.');
    return { updated: found.map(message => ({ ...message, seen: options.seen })), notFound: options.uids.filter(uid => !found.some(message => message.uid === uid)) };
  }));
}
