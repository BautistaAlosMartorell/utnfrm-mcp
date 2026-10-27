import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { describe, expect, it } from 'vitest';
import { extractFileContent } from '../src/parsers/file-extractor.js';
import { extractPdfLayout, layoutPageText, type LayoutItem } from '../src/parsers/pdf-layout.js';
import { renderPdfPage } from '../src/parsers/pdf-render.js';

const fixture = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tabla-sintetica.pdf'));
const item = (str: string, x: number, y: number, width = str.length * 6, height = 12): LayoutItem => ({ str, x, y, width, height });

describe('layoutPageText', () => {
  it('keeps plain lines in reading order, top to bottom', () => {
    const { text, tables } = layoutPageText([item('segundo', 50, 700), item('primero', 50, 740), item('tercero', 50, 660)]);
    expect(text).toBe('primero\nsegundo\ntercero');
    expect(tables).toBe(0);
  });

  it('joins words of the same line and does not split on normal word spacing', () => {
    const { text } = layoutPageText([item('Plan', 50, 700), item('agregado', 78, 700), item('de producción', 130, 700)]);
    expect(text).toBe('Plan agregado de producción');
  });

  it('rebuilds a table with its empty cells, whatever the alignment', () => {
    const items = [
      item('Semana', 50, 700), item('1', 200, 700, 6), item('2', 260, 700, 6), item('3', 320, 700, 6),
      item('Brutos', 50, 680), item('140', 190, 680, 18), item('120', 250, 680, 18), item('150', 310, 680, 18),
      item('Recepciones', 50, 660), item('250', 190, 660, 18),
      item('Netos', 50, 640), item('80', 310, 640, 12)
    ];
    const { text, tables } = layoutPageText(items);
    expect(tables).toBe(1);
    expect(text.split('\n')).toEqual([
      '| Semana | 1 | 2 | 3 |',
      '| --- | --- | --- | --- |',
      '| Brutos | 140 | 120 | 150 |',
      '| Recepciones | 250 |  |  |',
      '| Netos |  |  | 80 |'
    ]);
  });

  it('does not turn a single multi-column line into a table', () => {
    const { text, tables } = layoutPageText([item('Izquierda', 50, 700), item('Derecha', 300, 700), item('Texto normal', 50, 680)]);
    expect(tables).toBe(0);
    expect(text).toBe('Izquierda  Derecha\nTexto normal');
  });

  it('escapes pipes inside cells and ignores blank items', () => {
    const { text } = layoutPageText([
      item('a|b', 50, 700), item('c', 200, 700), item('   ', 400, 700),
      item('d', 50, 680), item('e', 200, 680)
    ]);
    expect(text.split('\n')[0]).toBe('| a\\|b | c |');
  });
});

describe('extractPdfLayout on a real PDF', () => {
  it('reads the synthetic MRP table with its empty cells', async () => {
    const result = await extractPdfLayout(fixture);
    expect(result.totalPages).toBe(1);
    expect(result.tables).toBe(1);
    const page = result.pages.get(1)!;
    expect(page).toContain('Registro MRP de prueba');
    expect(page).toContain('| Semana | 1 | 2 | 3 | 4 |');
    expect(page).toContain('| Recepciones programadas | 250 |  |  |  |');
    expect(page).toContain('| Emisión planeada |  | 250 |  | 250 |');
  });

  it('can read a single page and fails clearly on garbage', async () => {
    expect((await extractPdfLayout(fixture, { page: 1 })).pages.size).toBe(1);
    await expect(extractPdfLayout(Buffer.from('esto no es un pdf'))).rejects.toThrow();
  });

  it('is used by read_file content extraction when layout is requested, and not otherwise', async () => {
    const withLayout = await extractFileContent(fixture, 'tabla.pdf', 'application/pdf', 'x', { layout: true });
    expect(withLayout.content).toContain('| Emisión planeada |  | 250 |  | 250 |');
    expect(withLayout.extractionStatus).toBe('complete');
    const linear = await extractFileContent(fixture, 'tabla.pdf', 'application/pdf', 'x', {});
    expect(linear.content).not.toContain('| --- |');
  });
});

const hasBrowser = (() => { try { return fs.existsSync(chromium.executablePath()); } catch { return false; } })();

describe.skipIf(!hasBrowser)('renderPdfPage', () => {
  it('draws a page as a PNG image', async () => {
    const rendered = await renderPdfPage(fixture, 1, 1);
    expect(rendered.png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(rendered).toMatchObject({ page: 1, totalPages: 1 });
    expect(rendered.width).toBeGreaterThan(400);
    expect(rendered.png.length).toBeGreaterThan(2000);
  }, 60_000);

  it('rejects pages out of range and non-PDF data', async () => {
    await expect(renderPdfPage(fixture, 9, 1)).rejects.toThrow(/1 páginas/);
    await expect(renderPdfPage(fixture, 0)).rejects.toThrow(/entero/);
    await expect(renderPdfPage(Buffer.from('nada'), 1)).rejects.toThrow();
  }, 60_000);
});
