import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Extracción de PDF que conserva el diseño: agrupa el texto por renglón y reconstruye las tablas con sus
 * columnas (incluidas las celdas vacías), que es justo lo que se pierde con la extracción lineal.
 */
export interface LayoutItem { str: string; x: number; y: number; width: number; height: number }

type Cell = { x0: number; x1: number; text: string };
type Row = { y: number; height: number; cells: Cell[] };

const MIN_TABLE_ROWS = 2;

function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildRows(items: LayoutItem[]): Row[] {
  const useful = items.filter(item => item.str.trim().length > 0);
  const sorted = [...useful].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Array<{ y: number; items: LayoutItem[] }> = [];
  for (const item of sorted) {
    const height = item.height > 0 ? item.height : 10;
    const current = rows[rows.length - 1];
    if (current && Math.abs(current.y - item.y) <= height * 0.45) {
      current.items.push(item);
      current.y = (current.y * (current.items.length - 1) + item.y) / current.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }
  return rows.map(row => {
    const ordered = [...row.items].sort((a, b) => a.x - b.x);
    const height = median(ordered.map(item => item.height).filter(value => value > 0), 10);
    const cells: Cell[] = [];
    for (const item of ordered) {
      const previous = cells[cells.length - 1];
      const gap = previous ? item.x - previous.x1 : Infinity;
      if (previous && gap <= height * 0.6) {
        const needsSpace = gap > height * 0.15 && !previous.text.endsWith(' ') && !item.str.startsWith(' ');
        previous.text += (needsSpace ? ' ' : '') + item.str;
        previous.x1 = Math.max(previous.x1, item.x + item.width);
      } else {
        cells.push({ x0: item.x, x1: item.x + item.width, text: item.str });
      }
    }
    for (const cell of cells) cell.text = cell.text.replace(/\s+/g, ' ').trim();
    return { y: row.y, height, cells };
  });
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/**
 * Columnas = franjas verticales ocupadas por texto: se unen los intervalos [x0, x1] de todas las celdas de la
 * tabla (con una pequeña tolerancia). Funciona con texto alineado a la izquierda, centrado o a la derecha,
 * porque las celdas de una misma columna siempre se superponen o quedan muy cerca.
 */
function columnBands(rows: Row[], tolerance: number): Array<{ x0: number; x1: number }> {
  const intervals = rows.flatMap(row => row.cells.map(cell => ({ x0: cell.x0, x1: cell.x1 }))).sort((a, b) => a.x0 - b.x0);
  const bands: Array<{ x0: number; x1: number }> = [];
  for (const interval of intervals) {
    const last = bands[bands.length - 1];
    if (last && interval.x0 <= last.x1 + tolerance) last.x1 = Math.max(last.x1, interval.x1);
    else bands.push({ ...interval });
  }
  return bands;
}

function renderTable(rows: Row[]): string[] {
  const height = median(rows.map(row => row.height), 10);
  const bands = columnBands(rows, height * 0.35);
  const lines: string[] = [];
  rows.forEach((row, index) => {
    const columns: string[] = bands.map(() => '');
    for (const cell of row.cells) {
      const center = (cell.x0 + cell.x1) / 2;
      let best = bands.findIndex(band => center >= band.x0 && center <= band.x1);
      if (best < 0) {
        best = 0;
        for (let i = 1; i < bands.length; i += 1) {
          const distance = (band: { x0: number; x1: number }) => Math.min(Math.abs(band.x0 - center), Math.abs(band.x1 - center));
          if (distance(bands[i]) < distance(bands[best])) best = i;
        }
      }
      columns[best] = columns[best] ? `${columns[best]} ${cell.text}` : cell.text;
    }
    lines.push(`| ${columns.map(escapeCell).join(' | ')} |`);
    if (index === 0) lines.push(`| ${bands.map(() => '---').join(' | ')} |`);
  });
  return lines;
}

/** Texto de una página con sus renglones y tablas (en formato Markdown). `tables` cuenta las tablas halladas. */
export function layoutPageText(items: LayoutItem[]): { text: string; tables: number } {
  const rows = buildRows(items);
  const out: string[] = [];
  let tables = 0;
  for (let i = 0; i < rows.length;) {
    if (rows[i].cells.length >= 2) {
      let end = i;
      while (end < rows.length && rows[end].cells.length >= 2) end += 1;
      if (end - i >= MIN_TABLE_ROWS) {
        out.push(...renderTable(rows.slice(i, end)));
        tables += 1;
        i = end;
        continue;
      }
    }
    out.push(rows[i].cells.map(cell => cell.text).join('  '));
    i += 1;
  }
  return { text: out.join('\n'), tables };
}

export interface PdfLayoutResult { totalPages: number; pages: Map<number, string>; tables: number }

type TextContentItem = { str?: string; transform?: number[]; width?: number; height?: number };

/** Lee un PDF y devuelve el texto con diseño de cada página (o solo de `page`). */
export async function extractPdfLayout(buffer: Buffer, options: { page?: number; timeoutMs?: number } = {}): Promise<PdfLayoutResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const packageDir = path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
    standardFontDataUrl: `${path.join(packageDir, 'standard_fonts')}/`,
    cMapUrl: `${path.join(packageDir, 'cmaps')}/`,
    cMapPacked: true
  });
  const timer = setTimeout(() => { void task.destroy(); }, options.timeoutMs ?? 60_000);
  try {
    const document = await task.promise;
    const pages = new Map<number, string>();
    let tables = 0;
    const first = options.page ?? 1;
    const last = options.page ?? document.numPages;
    for (let number = first; number <= Math.min(last, document.numPages); number += 1) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const items: LayoutItem[] = (content.items as TextContentItem[])
        .filter(item => typeof item.str === 'string' && Array.isArray(item.transform))
        .map(item => ({
          str: item.str as string,
          x: item.transform![4],
          y: item.transform![5],
          width: item.width ?? 0,
          height: item.height || Math.hypot(item.transform![2], item.transform![3])
        }));
      const laidOut = layoutPageText(items);
      pages.set(number, laidOut.text);
      tables += laidOut.tables;
    }
    return { totalPages: document.numPages, pages, tables };
  } finally {
    clearTimeout(timer);
    void task.destroy();
  }
}
