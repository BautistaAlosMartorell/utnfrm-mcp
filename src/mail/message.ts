import * as cheerio from 'cheerio';
import type { MessageAddressObject, MessageStructureObject } from 'imapflow';

export type MailAttachment = { filename: string; type: string; size?: number };
export type BodyPart = { part: string; type: string; charset?: string };

export function formatAddress(address: MessageAddressObject | undefined): string {
  if (!address) return '';
  return address.name && address.address ? `${address.name} <${address.address}>` : address.address ?? address.name ?? '';
}

/**
 * Elige el cuerpo a leer (prefiere text/plain sobre text/html) y lista los adjuntos sin descargarlos.
 * Un mensaje de una sola parte no trae número de parte: IMAP lo llama "1".
 */
export function describeStructure(root: MessageStructureObject | undefined): { body?: BodyPart; attachments: MailAttachment[] } {
  const attachments: MailAttachment[] = [];
  let plain: BodyPart | undefined;
  let html: BodyPart | undefined;

  const visit = (node: MessageStructureObject): void => {
    if (node.childNodes?.length) { node.childNodes.forEach(visit); return; }
    const filename = node.dispositionParameters?.filename ?? node.parameters?.name;
    const asAttachment = node.disposition === 'attachment' || (Boolean(filename) && !node.type.startsWith('text/'));
    if (asAttachment) {
      attachments.push({ filename: filename ?? '(sin nombre)', type: node.type, ...(node.size !== undefined ? { size: node.size } : {}) });
      return;
    }
    const candidate = { part: node.part ?? '1', type: node.type, ...(node.parameters?.charset ? { charset: node.parameters.charset } : {}) };
    if (node.type === 'text/plain') plain ??= candidate;
    else if (node.type === 'text/html') html ??= candidate;
  };
  if (root) visit(root);
  const body = plain ?? html;
  return { ...(body ? { body } : {}), attachments };
}

/** Decodifica el cuerpo con su charset (UTF-8 si falta o no se conoce) y convierte HTML a texto plano. */
export function decodeBody(bytes: Buffer, part: BodyPart): string {
  let text: string;
  try { text = new TextDecoder(part.charset ?? 'utf-8').decode(bytes); }
  catch { text = new TextDecoder('utf-8').decode(bytes); }
  if (part.type !== 'text/html') return text.trim();
  const $ = cheerio.load(text);
  $('script,style,head').remove();
  $('br').replaceWith('\n');
  $('p,div,li,tr,h1,h2,h3,h4,h5,h6').append('\n');
  return $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
