import { describe, expect, it } from 'vitest';
import { parseAutogestionAvisos } from '../src/parsers/autogestion-avisos.js';

const note = (title: string, date: string | undefined, body: string) =>
  `<li><h5>${title}</h5>${date ? `<p class="wp-notes-widget-date">${date}</p>` : ''}<p>${body}</p></li>`;

describe('parseAutogestionAvisos', () => {
  it('reads title, date and body, keeping line breaks', () => {
    const html = `<ul class="wp-notes-widget-list">
      ${note('Exámenes – Ingenierías 7mo Llamado', '26/10/2026', 'Las inscripciones se habilitarán a partir del 23/11/2026<br>Si rindo el: Lunes 30/11/2026 Puedo inscribirme o borrarme hasta: Viernes 27/11/2026 a las 18:00')}
      ${note('Certificados', '08/08/2022', 'Escribir a : certificado-alumno@frm.utn.edu.ar')}
    </ul>`;
    expect(parseAutogestionAvisos(html)).toEqual([
      { titulo: 'Exámenes – Ingenierías 7mo Llamado', fecha: '26/10/2026', texto: 'Las inscripciones se habilitarán a partir del 23/11/2026\nSi rindo el: Lunes 30/11/2026 Puedo inscribirme o borrarme hasta: Viernes 27/11/2026 a las 18:00' },
      { titulo: 'Certificados', fecha: '08/08/2022', texto: 'Escribir a : certificado-alumno@frm.utn.edu.ar' }
    ]);
  });

  it('omits the date when missing and ignores empty notes', () => {
    const html = `<ul class="wp-notes-widget-list">${note('Aviso sin fecha', undefined, 'Texto')}<li><h5></h5><p></p></li></ul>`;
    expect(parseAutogestionAvisos(html)).toEqual([{ titulo: 'Aviso sin fecha', texto: 'Texto' }]);
  });

  it('returns an empty list when the page has no notes', () => {
    expect(parseAutogestionAvisos('<body><p>otra cosa</p></body>')).toEqual([]);
  });
});
