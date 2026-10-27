import { describe, expect, it } from 'vitest';
import { parseInscripcionEstado, parseSysacadTable } from '../src/parsers/sysacad.js';

// Misma forma que las paginas ver.frc: tabla de maquetado con una tabla hoja de datos y una columna decorativa.
const page = (inner: string) => `<html><body><table><tr><td><table><tr><td>Mensajes</td></tr><tr><td>Aviso</td></tr></table>${inner}</td></tr></table></body></html>`;

const HISTORICO = page(`
  <p>Cantidad Total: 2</p>
  <table>
    <tr><td></td><th>Esp</th><th>PLAN</th><th>Materia</th><th>TOMO</th><th>FECHA</th><th>Nota</th><td></td></tr>
    <tr><td>›</td><td>5</td><td>2023</td><td>Sistemas de Gestión</td><td>671</td><td>30/06/2026</td><td>7</td><td></td></tr>
    <tr><td>›</td><td>5</td><td>2023</td><td>Gestión Gerencial</td><td>671</td><td>30/06/2026</td><td>8</td><td></td></tr>
    <tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
  </table>`);

describe('parseSysacadTable', () => {
  it('extracts the data table, drops decorative columns and empty rows, and reads the total', () => {
    const table = parseSysacadTable(HISTORICO);
    expect(table.columns).toEqual(['esp', 'plan', 'materia', 'tomo', 'fecha', 'nota']);
    expect(table.total).toBe(2);
    expect(table.rows).toEqual([
      { esp: '5', plan: '2023', materia: 'Sistemas de Gestión', tomo: '671', fecha: '30/06/2026', nota: '7' },
      { esp: '5', plan: '2023', materia: 'Gestión Gerencial', tomo: '671', fecha: '30/06/2026', nota: '8' }
    ]);
    expect(table.text).toBeUndefined();
  });

  it('keeps text-only headers and ignores symbol headers such as "+"', () => {
    const table = parseSysacadTable(page(`<table>
      <tr><td></td><td></td><td>Materia</td><td>Curso</td><td>Bed</td><td>+</td></tr>
      <tr><td>›</td><td></td><td>Inteligencia Artificial</td><td>5K10</td><td>Reg.</td><td>(Aula Virtual)</td></tr>
    </table>`));
    expect(table.columns).toEqual(['materia', 'curso', 'bed']);
    expect(table.rows).toEqual([{ materia: 'Inteligencia Artificial', curso: '5K10', bed: 'Reg.' }]);
  });

  it('reports the site message when there is no data, without a text dump', () => {
    const table = parseSysacadTable(page('<p>No se encuentran datos de EXÏ¿½MENES APLAZADOS .</p>'));
    expect(table.rows).toEqual([]);
    expect(table.message).toBe('No se encuentran datos para esta consulta.');
    expect(table.text).toBeUndefined();
  });

  it('falls back to bounded page text when no data table is recognised', () => {
    const table = parseSysacadTable(`<body><p>${'x'.repeat(9000)}</p></body>`);
    expect(table.rows).toEqual([]);
    expect(table.text).toHaveLength(6000);
  });
});

describe('parseInscripcionEstado', () => {
  it('reports a closed enrollment with the site notice', () => {
    expect(parseInscripcionEstado('<body>No se puede inscribir a cursar en la especialidad Ingeniería en Sistemas de Información</body>'))
      .toEqual({ abierta: false, mensaje: 'No se puede inscribir a cursar en la especialidad Ingeniería en Sistemas de Información' });
  });

  it('lists the subjects when enrollment is open', () => {
    expect(parseInscripcionEstado('<body><a href="#">Inteligencia Artificial</a><a href="#"></a><a href="#">Ciencia de Datos</a></body>'))
      .toEqual({ abierta: true, materias: ['Inteligencia Artificial', 'Ciencia de Datos'] });
  });

  it('returns undefined for a screen it does not recognise', () => {
    expect(parseInscripcionEstado('<body>Espere por favor ...</body>')).toBeUndefined();
  });
});
