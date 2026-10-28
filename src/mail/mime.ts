import { decodeBody, type MailAttachment } from './message.js';

/**
 * Lector mínimo de mensajes RFC 822 crudos (los que entrega Roundcube con `viewsource`). `raw` es el mensaje
 * en latin1 (un carácter por byte), para no deformar cuerpos que no son UTF-8.
 */
export type RawHeaders = Map<string, string>;
type Part = { headers: RawHeaders; body: string };

const HEADER_END = /\r?\n\r?\n/;

function splitPart(raw: string): Part {
  const match = HEADER_END.exec(raw);
  const head = match ? raw.slice(0, match.index) : raw;
  const body = match ? raw.slice(match.index + match[0].length) : '';
  const headers: RawHeaders = new Map();
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim().toLowerCase();
    if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());
  }
  return { headers, body };
}

function decodeCharset(bytes: Buffer, charset: string): string {
  try { return new TextDecoder(charset).decode(bytes); } catch { return new TextDecoder('utf-8').decode(bytes); }
}

/** Palabras codificadas (RFC 2047): =?charset?B|Q?texto?=. Las contiguas se unen sin el espacio intermedio. */
export function decodeWords(value: string): string {
  const joined = value.replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?[^?]+\?[bBqQ]\?)/g, '$1');
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, encoding: string, text: string) => {
    const bytes = encoding.toLowerCase() === 'b'
      ? Buffer.from(text, 'base64')
      : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_x, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
    return decodeCharset(bytes, charset);
  });
}

/** `"Nombre" <a@b>` → `Nombre <a@b>`; deja las listas como vienen, ya decodificadas. */
export function decodeAddresses(value: string | undefined): string {
  if (!value) return '';
  return decodeWords(value).replace(/"([^"]*)"\s*</g, '$1 <').replace(/\s+/g, ' ').trim();
}

function params(value: string | undefined): { type: string; params: Record<string, string> } {
  const [type = '', ...rest] = (value ?? '').split(';');
  const out: Record<string, string> = {};
  for (const piece of rest) {
    const eq = piece.indexOf('=');
    if (eq < 0) continue;
    out[piece.slice(0, eq).trim().toLowerCase()] = piece.slice(eq + 1).trim().replace(/^"|"$/g, '');
  }
  return { type: type.trim().toLowerCase(), params: out };
}

function filenameOf(headers: RawHeaders, contentType: ReturnType<typeof params>): string | undefined {
  const disposition = params(headers.get('content-disposition'));
  const extended = disposition.params['filename*'] ?? contentType.params['name*'];
  if (extended) {
    const m = /^([^']*)'[^']*'(.*)$/.exec(extended);
    if (m) {
      const bytes = Buffer.from(m[2]!.replace(/%([0-9A-Fa-f]{2})/g, (_x, hex: string) => String.fromCharCode(parseInt(hex, 16))), 'latin1');
      return decodeCharset(bytes, m[1] || 'utf-8');
    }
  }
  const plain = disposition.params.filename ?? contentType.params.name;
  return plain ? decodeWords(plain) : undefined;
}

function transferDecode(body: string, encoding: string | undefined): Buffer {
  switch ((encoding ?? '').toLowerCase()) {
    case 'base64': return Buffer.from(body.replace(/\s+/g, ''), 'base64');
    case 'quoted-printable': {
      const text = body.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
      return Buffer.from(text, 'latin1');
    }
    default: return Buffer.from(body, 'latin1');
  }
}

export type ParsedMessage = { headers: RawHeaders; text: string; attachments: MailAttachment[] };

export function parseRawMessage(raw: string): ParsedMessage {
  const root = splitPart(raw);
  const attachments: MailAttachment[] = [];
  let plain: { bytes: Buffer; charset?: string } | undefined;
  let html: { bytes: Buffer; charset?: string } | undefined;

  const visit = (part: Part): void => {
    const contentType = params(part.headers.get('content-type') || 'text/plain');
    const boundary = contentType.params.boundary;
    if (contentType.type.startsWith('multipart/') && boundary) {
      const marker = `--${boundary}`;
      const chunks = part.body.split(marker).slice(1);
      for (const chunk of chunks) {
        if (chunk.startsWith('--')) break; // cierre
        visit(splitPart(chunk.replace(/^\r?\n/, '')));
      }
      return;
    }
    const filename = filenameOf(part.headers, contentType);
    const bytes = transferDecode(part.body, part.headers.get('content-transfer-encoding'));
    const asAttachment = params(part.headers.get('content-disposition')).type === 'attachment' || (Boolean(filename) && !contentType.type.startsWith('text/'));
    if (asAttachment) {
      attachments.push({ filename: filename ?? '(sin nombre)', type: contentType.type, size: bytes.length });
      return;
    }
    const candidate = { bytes, ...(contentType.params.charset ? { charset: contentType.params.charset } : {}) };
    if (contentType.type === 'text/plain') plain ??= candidate;
    else if (contentType.type === 'text/html') html ??= candidate;
  };
  visit(root);

  const chosen = plain ?? html;
  const text = chosen ? decodeBody(chosen.bytes, { part: '1', type: plain ? 'text/plain' : 'text/html', ...(chosen.charset ? { charset: chosen.charset } : {}) }) : '';
  return { headers: root.headers, text, attachments };
}

/** Fecha de la cabecera `Date` en ISO, o undefined si no se puede leer. */
export function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
