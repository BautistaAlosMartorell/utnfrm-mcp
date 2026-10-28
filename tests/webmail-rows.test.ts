import { describe, expect, it } from 'vitest';
import { rowToSummary } from '../src/mail/webmail-client.js';

describe('rowToSummary (fila de la lista de Roundcube)', () => {
  const fromto = (name: string, email: string) => `<span class="adr"><span title="${email}" class="rcmContactAddress">${name}</span></span>`;

  it('builds "Name <email>", reads seen from flags and keeps the date as shown', () => {
    const summary = rowToSummary({ uid: 6297, cols: { subject: 'Foro &amp; novedades', fromto: fromto('Ana Pérez', 'ana@x.edu.ar'), date: 'Oct 28 15:02', size: '9 KB' }, flags: { seen: 1, ctype: 'multipart/alternative', mbox: 'INBOX' } });
    expect(summary).toEqual({ uid: 6297, from: 'Ana Pérez <ana@x.edu.ar>', subject: 'Foro & novedades', date: 'Oct 28 15:02', seen: true });
  });

  it('marks unread rows (no seen flag) and shows just the address when there is no name', () => {
    const summary = rowToSummary({ uid: 1, cols: { subject: 'x', fromto: fromto('a@x.edu.ar', 'a@x.edu.ar'), date: '' }, flags: {} });
    expect(summary).toMatchObject({ from: 'a@x.edu.ar', seen: false });
    expect(summary).not.toHaveProperty('date');
  });
});
