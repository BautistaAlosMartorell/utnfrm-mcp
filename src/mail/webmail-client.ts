import * as cheerio from 'cheerio';
import { chromium, type Browser, type Page } from 'playwright';
import { WEBMAIL_URL } from '../config.js';
import { SessionStore } from '../session/session-store.js';
import { decodeAddresses, decodeWords, isoDate, parseRawMessage, type RawHeaders } from './mime.js';
import type { MailMessage, MailSearchCriteria, MailSearchHit, MailSummary } from './client.js';

/**
 * Correo por el Webmail (Roundcube) con las cookies que guarda `utn-mcp-mendoza login`: alternativa al IMAP cuando no
 * hay contraseña guardada. Una sola página compartida, por eso se serializa. Los mensajes se leen con `viewsource`
 * (mensaje crudo): a diferencia de la vista previa, no lo marca como leído.
 */
const NAV_TIMEOUT_MS = 30_000;
const IDLE_CLOSE_MS = 5 * 60_000;
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
const HEAD_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 20_000;
const UNSEEN_SCAN_LIMIT = 200;

export const WEBMAIL_EXPIRED_MESSAGE = 'La sesión del Webmail venció. Ejecutá utn-mcp-mendoza login (o guardá credenciales con utn-mcp-mendoza setup-wizard para usar IMAP).';
export class WebmailSessionError extends Error {}

export type WebmailRow = { uid: number; cols: Record<string, string>; flags: Record<string, unknown> };
type ListResult = { rows: WebmailRow[]; env: { messagecount?: number; pagecount?: number; pagesize?: number }; exec: string };

const text = (html: string | undefined): string => cheerio.load(html ?? '', null, false).text().replace(/\s+/g, ' ').trim();

/** Una fila de la lista de Roundcube. La fecha es la que muestra el sitio ("Oct 28 15:02"), no ISO. */
export function rowToSummary(row: WebmailRow): MailSummary {
  const $ = cheerio.load(row.cols.fromto ?? '', null, false);
  const address = $('.rcmContactAddress').first();
  const email = address.attr('title')?.trim() ?? '';
  const name = (address.text() || text(row.cols.fromto)).trim();
  const from = email && name && name !== email ? `${name} <${email}>` : email || name;
  const date = text(row.cols.date);
  return { uid: row.uid, from, subject: text(row.cols.subject), ...(date ? { date } : {}), seen: Boolean(row.flags.seen) };
}

const SERVER_ERROR = /display_message\((?:"(?:[^"\\]|\\.)*"),\s*"error"/;

export class WebmailClient {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private idleTimer: NodeJS.Timeout | undefined;

  async close(): Promise<void> {
    clearTimeout(this.idleTimer);
    const browser = this.browser;
    this.browser = null;
    this.page = null;
    await browser?.close().catch(() => null);
  }

  /** Abre el Webmail con las cookies guardadas y comprueba que siga la sesión. */
  verify(): Promise<void> {
    return this.run(async () => undefined);
  }

  private run<T>(action: (page: Page) => Promise<T>): Promise<T> {
    const task = async (): Promise<T> => {
      clearTimeout(this.idleTimer);
      try {
        return await action(await this.session());
      } catch (error) {
        if (error instanceof WebmailSessionError) await this.close(); // la próxima vez se relee lo guardado
        throw error;
      } finally {
        this.idleTimer = setTimeout(() => { void this.close(); }, IDLE_CLOSE_MS);
        this.idleTimer.unref();
      }
    };
    const result = this.queue.then(task, task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async session(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (!SessionStore.exists()) throw new WebmailSessionError('No hay una sesión guardada del Webmail. Ejecutá utn-mcp-mendoza login (o guardá credenciales con utn-mcp-mendoza setup-wizard).');
    await this.close();
    this.browser = await chromium.launch({ headless: true });
    try {
      const context = await this.browser.newContext({ acceptDownloads: false, storageState: await SessionStore.getPlaywrightStorageState() });
      const page = await context.newPage();
      page.setDefaultTimeout(NAV_TIMEOUT_MS);
      await page.goto(`${WEBMAIL_URL}?_task=mail&_mbox=INBOX`, { waitUntil: 'domcontentloaded' });
      const logged = await page.evaluate(() => {
        const rc = (window as unknown as { rcmail?: { env?: { task?: string } } }).rcmail;
        return rc?.env?.task === 'mail';
      }).catch(() => false);
      if (!logged) throw new WebmailSessionError(WEBMAIL_EXPIRED_MESSAGE);
      this.page = page;
      return page;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  /** Pedido al servidor desde la propia página (cookies y token de Roundcube incluidos). */
  private async request(page: Page, query: string, form?: Record<string, string>): Promise<string> {
    const body = await page.evaluate(async ({ query, form }) => {
      const rc = (window as unknown as { rcmail: { env: { request_token: string } } }).rcmail;
      const headers: Record<string, string> = { 'X-Roundcube-Request': rc.env.request_token };
      if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const response = await fetch(`?${query}`, { method: form ? 'POST' : 'GET', headers, ...(form ? { body: new URLSearchParams(form).toString() } : {}) });
      return response.text();
    }, { query, form });
    return body;
  }

  /** Mensaje crudo (hasta `maxBytes`) en latin1. undefined si el servidor no devuelve un mensaje. */
  private async rawMessage(page: Page, folder: string, uid: number, maxBytes: number): Promise<string | undefined> {
    const base64 = await page.evaluate(async ({ query, maxBytes }) => {
      const rc = (window as unknown as { rcmail: { env: { request_token: string } } }).rcmail;
      const response = await fetch(`?${query}`, { headers: { 'X-Roundcube-Request': rc.env.request_token } });
      if (!response.ok || !response.body) return '';
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.length;
      }
      await reader.cancel().catch(() => undefined);
      let binary = '';
      for (const chunk of chunks) for (let i = 0; i < chunk.length; i += 0x8000) binary += String.fromCharCode(...chunk.subarray(i, i + 0x8000));
      return btoa(binary.slice(0, maxBytes));
    }, { query: `_task=mail&_action=viewsource&_uid=${uid}&_mbox=${encodeURIComponent(folder)}`, maxBytes });
    if (!base64) return undefined;
    const raw = Buffer.from(base64, 'base64').toString('latin1');
    return /^(from|date|subject|received|return-path|message-id|mime-version):/im.test(raw.slice(0, 4000)) ? raw : undefined;
  }

  /** Filas de una lista o búsqueda de Roundcube. El `exec` que devuelve el servidor se ejecuta solo para recoger add_message_row. */
  private async rows(page: Page, query: string): Promise<ListResult> {
    const raw = await this.request(page, query);
    let json: { env?: ListResult['env']; exec?: string };
    try { json = JSON.parse(raw); } catch { throw new WebmailSessionError(WEBMAIL_EXPIRED_MESSAGE); }
    const exec = json.exec ?? '';
    if (SERVER_ERROR.test(exec)) {
      throw new Error(/Mailbox doesn't exist/i.test(exec)
        ? `No existe la carpeta "${new URLSearchParams(query).get('_mbox')}" en el correo (las habituales son INBOX, Sent, Drafts y Trash).`
        : 'El servidor del correo respondió con un error.');
    }
    const rows = await page.evaluate((exec: string) => {
      const collected: Array<{ uid: number; cols: Record<string, string>; flags: Record<string, unknown> }> = [];
      const fake = new Proxy({}, { get: (_t, key) => key === 'add_message_row' ? (uid: unknown, cols: Record<string, string>, flags: Record<string, unknown>) => { collected.push({ uid: Number(uid), cols, flags }); } : () => undefined });
      new Function(exec).call(fake);
      return collected;
    }, exec);
    return { rows, env: json.env ?? {}, exec };
  }

  private async collect(page: Page, queryFor: (pageNumber: number) => string, limit: number): Promise<WebmailRow[]> {
    const out: WebmailRow[] = [];
    for (let pageNumber = 1; out.length < limit; pageNumber += 1) {
      const { rows, env } = await this.rows(page, queryFor(pageNumber));
      out.push(...rows);
      if (rows.length === 0 || pageNumber >= (env.pagecount ?? 1)) break;
    }
    return out.slice(0, limit);
  }

  private async unseenSet(page: Page, folder: string): Promise<Set<number>> {
    const rows = await this.collect(page, n => `_task=mail&_action=search&_mbox=${encodeURIComponent(folder)}&_filter=UNSEEN&_page=${n}&_remote=1`, UNSEEN_SCAN_LIMIT);
    return new Set(rows.map(row => row.uid));
  }

  listMessages(options: { folder: string; limit: number; unseenOnly: boolean }): Promise<MailSummary[]> {
    return this.run(async page => {
      const mbox = encodeURIComponent(options.folder);
      const query = options.unseenOnly
        ? (n: number) => `_task=mail&_action=search&_mbox=${mbox}&_filter=UNSEEN&_page=${n}&_remote=1`
        : (n: number) => `_task=mail&_action=list&_mbox=${mbox}&_page=${n}&_remote=1`;
      return (await this.collect(page, query, options.limit)).map(rowToSummary);
    });
  }

  /**
   * shortcut: el Webmail busca un solo texto por vez, así que se admite un criterio (from, to, subject o text) más unseen_only;
   * since/before y combinaciones piden IMAP (credenciales guardadas).
   */
  searchMessages(options: MailSearchCriteria & { folders?: string[]; limit: number }): Promise<MailSearchHit[]> {
    const criteria = (['from', 'to', 'subject', 'text'] as const).filter(key => options[key]);
    if (options.since || options.before || criteria.length > 1) {
      return Promise.reject(new Error('Sin contraseña guardada, el correo busca por un solo criterio (from, to, subject o text), con unseen_only si querés; since/before y combinaciones piden guardar credenciales con utn-mcp-mendoza setup-wizard.'));
    }
    if (criteria.length === 0 && !options.unseenOnly) return Promise.reject(new Error('Indicá al menos un criterio de búsqueda (from, to, subject, text o unseen_only).'));
    const [key] = criteria;
    return this.run(async page => {
      // Roundcube agrupa por carpeta en su búsqueda global: se recorre carpeta por carpeta (INBOX primero), hasta llenar el límite.
      const folders = options.folders?.length ? options.folders : await page.evaluate(() => Object.keys((window as unknown as { rcmail: { env: { mailboxes?: Record<string, unknown> } } }).rcmail.env.mailboxes ?? { INBOX: 1 }));
      const hits: MailSearchHit[] = [];
      for (const folder of folders) {
        if (hits.length >= options.limit) break;
        const base = `_task=mail&_action=search&_mbox=${encodeURIComponent(folder)}&_scope=base&_remote=1`
          + (key ? `&_q=${encodeURIComponent(options[key]!)}&_headers=${key}` : '')
          + (options.unseenOnly ? '&_filter=UNSEEN' : '');
        const rows = await this.collect(page, n => `${base}&_page=${n}`, options.limit - hits.length);
        for (const row of rows) hits.push({ folder, ...rowToSummary(row) });
      }
      return hits;
    });
  }

  readMessage(options: { folder: string; uid: number }): Promise<MailMessage> {
    return this.run(async page => {
      const raw = await this.rawMessage(page, options.folder, options.uid, MAX_MESSAGE_BYTES);
      if (!raw) throw new Error(`No existe el mensaje ${options.uid} en ${options.folder}.`);
      const parsed = parseRawMessage(raw);
      const unseen = await this.unseenSet(page, options.folder);
      return {
        ...this.summaryFromHeaders(options.uid, parsed.headers, !unseen.has(options.uid)),
        to: decodeAddresses(parsed.headers.get('to')),
        text: parsed.text.slice(0, MAX_TEXT_CHARS),
        truncated: parsed.text.length > MAX_TEXT_CHARS,
        attachments: parsed.attachments
      };
    });
  }

  private summaryFromHeaders(uid: number, headers: RawHeaders, seen: boolean): MailSummary {
    const date = isoDate(headers.get('date'));
    return { uid, from: decodeAddresses(headers.get('from')), subject: decodeWords(headers.get('subject') ?? ''), ...(date ? { date } : {}), seen };
  }

  /** Resumen por mensaje (cabeceras) de los que existen; el resto va a `notFound`. */
  private async summaries(page: Page, folder: string, uids: number[]): Promise<{ found: MailSummary[]; notFound: number[] }> {
    const unseen = await this.unseenSet(page, folder);
    const found: MailSummary[] = [];
    const notFound: number[] = [];
    for (const uid of uids) {
      const raw = await this.rawMessage(page, folder, uid, HEAD_BYTES);
      if (raw) found.push(this.summaryFromHeaders(uid, parseRawMessage(raw).headers, !unseen.has(uid)));
      else notFound.push(uid);
    }
    return { found, notFound };
  }

  private async post(page: Page, form: Record<string, string>, action: string, failure: string): Promise<void> {
    const raw = await this.request(page, `_task=mail&_action=${action}&_remote=1`, form);
    let exec = '';
    try { exec = (JSON.parse(raw) as { exec?: string }).exec ?? ''; } catch { throw new WebmailSessionError(WEBMAIL_EXPIRED_MESSAGE); }
    if (SERVER_ERROR.test(exec)) throw new Error(failure);
  }

  private async move(page: Page, folder: string, target: string, uids: number[], failure: string): Promise<{ moved: MailSummary[]; notFound: number[] }> {
    const { found, notFound } = await this.summaries(page, folder, uids);
    if (found.length === 0) throw new Error(`No encontré ninguno de esos mensajes en ${folder}.`);
    await this.post(page, { _uid: found.map(m => m.uid).join(','), _mbox: folder, _target_mbox: target }, 'move', failure);
    return { moved: found, notFound };
  }

  private trashName(page: Page): Promise<string> {
    return page.evaluate(() => (window as unknown as { rcmail: { env: { trash_mailbox?: string } } }).rcmail.env.trash_mailbox || 'Trash');
  }

  /** "Borrar" = mover a la Papelera (se puede deshacer); nunca borrado definitivo. */
  moveToTrash(options: { folder: string; uids: number[] }): Promise<{ trash: string; moved: MailSummary[]; notFound: number[] }> {
    return this.run(async page => {
      const trash = await this.trashName(page);
      if (options.folder.toLowerCase() === trash.toLowerCase()) throw new Error('Esos mensajes ya están en la Papelera. El borrado definitivo no está habilitado: vaciala desde el webmail.');
      return { trash, ...(await this.move(page, options.folder, trash, options.uids, 'El servidor no pudo mover los mensajes a la Papelera.')) };
    });
  }

  restoreFromTrash(options: { uids: number[]; to: string }): Promise<{ from: string; to: string; moved: MailSummary[]; notFound: number[] }> {
    return this.run(async page => {
      const trash = await this.trashName(page);
      if (options.to.toLowerCase() === trash.toLowerCase()) throw new Error('El destino no puede ser la Papelera.');
      return { from: trash, to: options.to, ...(await this.move(page, trash, options.to, options.uids, 'El servidor no pudo restaurar los mensajes (¿existe esa carpeta?).')) };
    });
  }

  setSeen(options: { folder: string; uids: number[]; seen: boolean }): Promise<{ updated: MailSummary[]; notFound: number[] }> {
    return this.run(async page => {
      const { found, notFound } = await this.summaries(page, options.folder, options.uids);
      if (found.length === 0) throw new Error(`No encontré ninguno de esos mensajes en ${options.folder}.`);
      await this.post(page, { _uid: found.map(m => m.uid).join(','), _mbox: options.folder, _flag: options.seen ? 'read' : 'unread' }, 'mark', 'El servidor no pudo cambiar el estado de lectura.');
      return { updated: found.map(m => ({ ...m, seen: options.seen })), notFound };
    });
  }
}

export const webmailClient = new WebmailClient();
