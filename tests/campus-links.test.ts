import { describe, expect, it } from 'vitest';
import {
  filenameFromContentDisposition,
  findPluginfileCandidates,
  pickResourceFile,
  repairMojibake,
  safeLocalFilename
} from '../src/client/campus-links.js';

const ORIGIN = 'https://campusvirtual.frm.utn.edu.ar';

describe('campus links', () => {
  it('prefers the module file over avatars and theme images', () => {
    const html = `
      <img src="${ORIGIN}/pluginfile.php/490/user/icon/boost/f1?rev=1">
      <img src='${ORIGIN}/pluginfile.php/1/theme_boost/logo/300x300/1/logo.png'>
      <a href="${ORIGIN}/pluginfile.php/55/mod_resource/content/2/Apunte%20Unidad.pdf?forcedownload=1">Apunte</a>`;
    expect(pickResourceFile(html, ORIGIN).url).toBe(`${ORIGIN}/pluginfile.php/55/mod_resource/content/2/Apunte%20Unidad.pdf?forcedownload=1`);
  });

  it('accepts single quotes and html entities', () => {
    const html = `<a href='/pluginfile.php/9/mod_resource/content/1/a.pdf?x=1&amp;y=2'>a</a>`;
    expect(findPluginfileCandidates(html, ORIGIN)[0].url).toBe(`${ORIGIN}/pluginfile.php/9/mod_resource/content/1/a.pdf?x=1&y=2`);
  });

  it('does not guess inside a folder with several files', () => {
    const html = `
      <a href="${ORIGIN}/pluginfile.php/8/mod_folder/content/0/uno.pdf">uno</a>
      <a href="${ORIGIN}/pluginfile.php/8/mod_folder/content/0/dos.pdf">dos</a>`;
    const picked = pickResourceFile(html, ORIGIN);
    expect(picked.url).toBeUndefined();
    expect(picked.ambiguous.map(file => file.name)).toEqual(['uno.pdf', 'dos.pdf']);
  });

  it('uses the only file of a folder and ignores foreign hosts', () => {
    const html = `<a href="${ORIGIN}/pluginfile.php/8/mod_folder/content/0/solo.pdf">x</a><a href="https://evil.example/pluginfile.php/1/mod_resource/content/1/x.pdf">y</a>`;
    expect(pickResourceFile(html, ORIGIN).url).toBe(`${ORIGIN}/pluginfile.php/8/mod_folder/content/0/solo.pdf`);
  });

  it('repairs UTF-8 file names that were decoded as Latin-1', () => {
    expect(repairMojibake('RegresiÃ³n logÃ­stica.pdf')).toBe('Regresión logística.pdf');
    expect(repairMojibake('Regresión.pdf')).toBe('Regresión.pdf');
    expect(repairMojibake('plain.pdf')).toBe('plain.pdf');
  });

  it('reads file names from Content-Disposition in every flavour', () => {
    expect(filenameFromContentDisposition(`attachment; filename*=UTF-8''Gu%C3%ADa.pdf`)).toBe('Guía.pdf');
    expect(filenameFromContentDisposition('inline; filename="U3 - \u00c3\u0081rboles.pdf"')).toBe('U3 - Árboles.pdf');
    expect(filenameFromContentDisposition('attachment; filename=simple.docx')).toBe('simple.docx');
    expect(filenameFromContentDisposition('')).toBeUndefined();
  });

  it('builds safe local file names', () => {
    expect(safeLocalFilename('../../etc/passwd')).toBe('passwd');
    expect(safeLocalFilename('..\\..\\evil.exe')).toBe('evil.exe');
    expect(safeLocalFilename('a<b>c:d"e|f?g*.pdf')).toBe('a_b_c_d_e_f_g_.pdf');
    expect(safeLocalFilename('.hidden')).toBe('hidden');
    expect(safeLocalFilename('CON')).toBe('archivo');
    expect(safeLocalFilename('   ')).toBe('archivo');
    expect(safeLocalFilename('x'.repeat(500)).length).toBeLessThanOrEqual(180);
  });
});
