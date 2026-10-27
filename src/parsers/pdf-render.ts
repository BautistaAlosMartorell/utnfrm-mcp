import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

/**
 * Dibuja una página de un PDF como imagen PNG para poder "verla" (diagramas, gráficos, fórmulas).
 * Usa el Chromium del MCP con pdf.js servido desde disco; todo lo demás queda bloqueado (sin red).
 */
const ORIGIN = 'https://pdf-render.invalid';
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS_WIDE = 2000;

function packageDir(): string {
  return path.dirname(fileURLToPath(import.meta.resolve('pdfjs-dist/package.json')));
}

function contentType(file: string): string {
  if (file.endsWith('.mjs') || file.endsWith('.js')) return 'text/javascript';
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.bcmap') || file.endsWith('.pfb') || file.endsWith('.ttf') || file.endsWith('.wasm')) return 'application/octet-stream';
  return 'application/octet-stream';
}

const VIEWER_HTML = '<!doctype html><html><body style="margin:0"><canvas id="c"></canvas></body></html>';

const BROWSER_RENDER = `async ({ data, pageNumber: wanted, scale: factor, origin, maxWide }) => {
  const pdfjs = await import(origin + '/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = origin + '/pdf.worker.mjs';
  const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0));
  const doc = await pdfjs.getDocument({
    data: bytes,
    standardFontDataUrl: origin + '/standard_fonts/',
    cMapUrl: origin + '/cmaps/',
    cMapPacked: true,
    wasmUrl: origin + '/wasm/'
  }).promise;
  if (wanted > doc.numPages) return { error: 'El PDF tiene ' + doc.numPages + ' páginas.' };
  const pdfPage = await doc.getPage(wanted);
  const base = pdfPage.getViewport({ scale: 1 });
  const effective = Math.min(factor, maxWide / base.width);
  const viewport = pdfPage.getViewport({ scale: effective });
  const canvas = document.getElementById('c');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await pdfPage.render({ canvas, viewport }).promise;
  return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height, totalPages: doc.numPages };
}`;

export interface RenderedPage { png: Buffer; width: number; height: number; page: number; totalPages: number }

export async function renderPdfPage(buffer: Buffer, pageNumber: number, scale = 1.5): Promise<RenderedPage> {
  if (buffer.length > MAX_PDF_BYTES) throw new Error('El PDF supera los 25 MiB: usá read_file para leer su texto.');
  if (!Number.isInteger(pageNumber) || pageNumber < 1) throw new Error('page debe ser un entero desde 1.');
  const safeScale = Math.min(3, Math.max(0.5, scale));
  const root = packageDir();
  const files: Record<string, string> = {
    '/pdf.mjs': path.join(root, 'build', 'pdf.mjs'),
    '/pdf.worker.mjs': path.join(root, 'build', 'pdf.worker.mjs')
  };

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext({ acceptDownloads: false, javaScriptEnabled: true })).newPage();
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== ORIGIN) return route.abort();
      if (url.pathname === '/viewer.html') return route.fulfill({ status: 200, contentType: 'text/html', body: VIEWER_HTML });
      let file = files[url.pathname];
      const asset = url.pathname.match(/^\/(standard_fonts|cmaps|wasm)\/([A-Za-z0-9._-]+)$/);
      if (!file && asset) file = path.join(root, asset[1], asset[2]);
      if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, contentType: contentType(file), body: fs.readFileSync(file) });
    });
    await page.goto(`${ORIGIN}/viewer.html`);
    // El código del navegador va como texto para que ningún empaquetador (p. ej. el de las pruebas) lo reescriba.
    const result = await page.evaluate(`(${BROWSER_RENDER})(${JSON.stringify({
      data: buffer.toString('base64'), pageNumber, scale: safeScale, origin: ORIGIN, maxWide: MAX_PIXELS_WIDE
    })})`) as { error: string } | { dataUrl: string; width: number; height: number; totalPages: number };
    if ('error' in result) throw new Error(result.error);
    return {
      png: Buffer.from(result.dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64'),
      width: result.width,
      height: result.height,
      page: pageNumber,
      totalPages: result.totalPages
    };
  } finally {
    await browser.close().catch(() => undefined);
  }
}
