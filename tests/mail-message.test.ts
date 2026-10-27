import { describe, expect, it } from 'vitest';
import type { MessageStructureObject } from 'imapflow';
import { decodeBody, describeStructure, formatAddress } from '../src/mail/message.js';

describe('describeStructure', () => {
  it('prefers text/plain over text/html and lists attachments without downloading them', () => {
    const root: MessageStructureObject = {
      type: 'multipart/mixed',
      childNodes: [
        { type: 'multipart/alternative', childNodes: [
          { part: '1.1', type: 'text/plain', parameters: { charset: 'iso-8859-1' } },
          { part: '1.2', type: 'text/html', parameters: { charset: 'utf-8' } }
        ] },
        { part: '2', type: 'application/pdf', size: 1234, disposition: 'attachment', dispositionParameters: { filename: 'constancia.pdf' } }
      ]
    };
    expect(describeStructure(root)).toEqual({
      body: { part: '1.1', type: 'text/plain', charset: 'iso-8859-1' },
      attachments: [{ filename: 'constancia.pdf', type: 'application/pdf', size: 1234 }]
    });
  });

  it('falls back to html, and treats a single-part message as part "1"', () => {
    expect(describeStructure({ type: 'text/html' }).body).toEqual({ part: '1', type: 'text/html' });
    expect(describeStructure(undefined)).toEqual({ attachments: [] });
  });
});

describe('decodeBody', () => {
  it('decodes the declared charset and falls back to utf-8 for an unknown one', () => {
    const latin1 = Buffer.from('Inscripción', 'latin1');
    expect(decodeBody(latin1, { part: '1', type: 'text/plain', charset: 'iso-8859-1' })).toBe('Inscripción');
    expect(decodeBody(Buffer.from('hola'), { part: '1', type: 'text/plain', charset: 'charset-inventado' })).toBe('hola');
  });

  it('turns html into readable text without scripts or styles', () => {
    const html = '<html><head><style>p{}</style></head><body><p>Hola</p><script>alert(1)</script><p>Mundo<br>fin</p></body></html>';
    const text = decodeBody(Buffer.from(html), { part: '1', type: 'text/html' });
    expect(text).toBe('Hola\nMundo\nfin');
    expect(text).not.toContain('alert');
  });
});

describe('formatAddress', () => {
  it('formats name and address, or whichever exists', () => {
    expect(formatAddress({ name: 'Mesa de Entrada', address: 'mesadeentrada@frm.utn.edu.ar' })).toBe('Mesa de Entrada <mesadeentrada@frm.utn.edu.ar>');
    expect(formatAddress({ address: 'a@b.c' })).toBe('a@b.c');
    expect(formatAddress(undefined)).toBe('');
  });
});
