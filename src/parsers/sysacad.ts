import * as cheerio from 'cheerio';

export type SysacadTable = {
  columns: string[];
  rows: Array<Record<string, string>>;
  /** "Cantidad Total: N" cuando la página lo informa. */
  total?: number;
  /** Mensaje del sitio cuando no hay datos ("No se encuentran datos de ..."). */
  message?: string;
  /** Texto de la página, solo cuando no se reconoció ninguna tabla de datos. */
  text?: string;
};

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const MAX_FALLBACK_TEXT = 6000;

/**
 * Autogestion (Sysacad) arma cada consulta como una tabla hoja con una fila de encabezado y una columna
 * decorativa vacia a la izquierda. Se elige la tabla hoja mas larga cuyo primer renglon tiene encabezados.
 */
export function parseSysacadTable(html: string): SysacadTable {
  const $ = cheerio.load(html);
  const bodyText = clean($('body').text());
  const total = /Cantidad Total:\s*(\d+)/i.exec(bodyText)?.[1];
  // El titulo del sitio llega con la codificacion rota ("EXÏ¿½MENES"): se informa sin el.
  const message = /No se encuentran datos de [^.]+\./i.test(bodyText) ? 'No se encuentran datos para esta consulta.' : undefined;

  let best: { rows: string[][]; header: string[] } | undefined;
  $('table').each((_, table) => {
    if ($(table).find('table').length > 0) return;
    const rows = $(table).find('tr').map((__, tr) => [$(tr).children('td,th').map((___, cell) => clean($(cell).text())).get()]).get() as string[][];
    if (rows.length < 2) return;
    const header = rows[0];
    if (header.filter(cell => /[\p{L}\d]/u.test(cell)).length < 3) return;
    if (!best || rows.length > best.rows.length) best = { rows, header };
  });

  const result: SysacadTable = { columns: [], rows: [] };
  if (total) result.total = Number(total);
  if (message) result.message = message;

  if (!best) {
    if (!message) result.text = bodyText.slice(0, MAX_FALLBACK_TEXT);
    return result;
  }

  const indexes = best.header.map((cell, index) => (/[\p{L}\d]/u.test(cell) ? index : -1)).filter(index => index >= 0);
  result.columns = indexes.map(index => best!.header[index].toLowerCase());
  result.rows = best.rows.slice(1)
    .map(cells => Object.fromEntries(indexes.map((index, position) => [result.columns[position], cells[index] ?? ''])))
    .filter(row => Object.values(row).some(Boolean));
  return result;
}

export type InscripcionEstado =
  | { abierta: false; mensaje: string }
  | { abierta: true; materias: string[] };

/**
 * Clasifica la pantalla final de la inscripcion a cursado. Solo lee: devuelve el aviso del sitio cuando esta
 * cerrada y el nombre de las materias listadas cuando esta abierta.
 */
export function parseInscripcionEstado(html: string): InscripcionEstado | undefined {
  const $ = cheerio.load(html);
  const text = clean($('body').text());
  const closed = /No se puede inscribir[^.]*/i.exec(text);
  if (closed) return { abierta: false, mensaje: closed[0] };
  const materias = $('a').map((_, a) => clean($(a).text())).get().filter(name => /[\p{L}]/u.test(name));
  return materias.length > 0 ? { abierta: true, materias } : undefined;
}
