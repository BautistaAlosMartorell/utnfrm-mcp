import { describe, expect, it } from 'vitest';
import { decodeAddresses, decodeWords, isoDate, parseRawMessage } from '../src/mail/mime.js';

const latin1 = (text: string) => Buffer.from(text, 'utf8').toString('latin1'); // el mensaje crudo llega con un carácter por byte

describe('decodeWords / decodeAddresses', () => {
  it('decodes RFC 2047 words (B and Q) and joins adjacent ones', () => {
    expect(decodeWords('=?UTF-8?B?Q2xhc2Ug?= =?UTF-8?B?ZGUgaG95?=')).toBe('Clase de hoy');
    expect(decodeWords('=?ISO-8859-1?Q?Pr=E1ctica_n=BA_3?=')).toBe('Práctica nº 3');
    expect(decodeWords('sin codificar')).toBe('sin codificar');
  });

  it('turns quoted names into plain ones', () => {
    expect(decodeAddresses('"Ana Pérez" <ana@x.edu.ar>, <b@x.edu.ar>')).toBe('Ana Pérez <ana@x.edu.ar>, <b@x.edu.ar>');
    expect(decodeAddresses(undefined)).toBe('');
  });
});

describe('parseRawMessage', () => {
  it('prefers text/plain, decodes quoted-printable with its charset and lists attachments', () => {
    const raw = [
      'From: =?UTF-8?B?w4FuYQ==?= <ana@x.edu.ar>',
      'Subject: Hola',
      'Date: Wed, 28 Oct 2026 15:02:00 -0300',
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed; boundary="MIX"',
      '',
      '--MIX',
      'Content-Type: multipart/alternative; boundary="ALT"',
      '',
      '--ALT',
      'Content-Type: text/plain; charset=ISO-8859-1',
      'Content-Transfer-Encoding: quoted-printable',
      '',
      'Pr=E1ctica =\r\nnueva',
      '--ALT',
      'Content-Type: text/html; charset=utf-8',
      '',
      '<p>html que no se elige</p>',
      '--ALT--',
      '--MIX',
      'Content-Type: application/pdf; name="guia.pdf"',
      'Content-Disposition: attachment; filename="guia.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from('0123456789').toString('base64'),
      '--MIX--',
      ''
    ].join('\r\n');
    const parsed = parseRawMessage(raw);
    expect(parsed.text).toBe('Práctica nueva');
    expect(parsed.attachments).toEqual([{ filename: 'guia.pdf', type: 'application/pdf', size: 10 }]);
    expect(decodeAddresses(parsed.headers.get('from'))).toBe('Ána <ana@x.edu.ar>');
  });

  it('falls back to html converted to text, and handles single-part UTF-8 bodies', () => {
    const html = parseRawMessage('Content-Type: text/html; charset=utf-8\n\n<p>Hola <b>mundo</b></p>');
    expect(html.text).toBe('Hola mundo');
    const utf8 = parseRawMessage(`Content-Type: text/plain; charset=utf-8\n\n${latin1('canción')}`);
    expect(utf8.text).toBe('canción');
  });

  it('reads RFC 2231 filenames', () => {
    const raw = ['Content-Type: multipart/mixed; boundary=B', '', '--B', "Content-Disposition: attachment; filename*=UTF-8''gu%C3%ADa.txt", 'Content-Type: text/plain', '', 'x', '--B--'].join('\n');
    expect(parseRawMessage(raw).attachments[0]?.filename).toBe('guía.txt');
  });
});

describe('isoDate', () => {
  it('converts the Date header and rejects garbage', () => {
    expect(isoDate('Wed, 28 Oct 2026 15:02:00 -0300')).toBe('2026-10-28T18:02:00.000Z');
    expect(isoDate('ayer')).toBeUndefined();
    expect(isoDate(undefined)).toBeUndefined();
  });
});
