import { campusClient } from '../client/campus-client.js';
import { renderPdfPage } from '../parsers/pdf-render.js';

export interface PdfPageImageInput { url: string; page: number; scale?: number }
export interface PdfPageImageMeta { filename: string; page: number; totalPages: number; width: number; height: number }

/** Imagen PNG de una página de un PDF del Campus, para ver diagramas, gráficos y fórmulas que el texto no captura. */
export async function handleGetPdfPageImage(input: PdfPageImageInput): Promise<{ png: Buffer; meta: PdfPageImageMeta }> {
  const download = await campusClient.downloadBuffer(input.url);
  const isPdf = download.contentType.includes('application/pdf') || /\.pdf$/i.test(download.filename) || download.buffer.subarray(0, 5).toString('latin1') === '%PDF-';
  if (!isPdf) throw new Error('El archivo no es un PDF: usá read_file para leerlo.');
  const rendered = await renderPdfPage(download.buffer, input.page, input.scale);
  return {
    png: rendered.png,
    meta: { filename: download.filename, page: rendered.page, totalPages: rendered.totalPages, width: rendered.width, height: rendered.height }
  };
}
