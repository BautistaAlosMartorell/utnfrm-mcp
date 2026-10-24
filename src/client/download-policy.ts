export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Require a valid declared size before Playwright buffers a Campus download. */
export function assertDownloadContentLength(contentLength: string | undefined): number {
  if (!contentLength || !/^\d+$/.test(contentLength.trim())) {
    throw new Error('No se pudo verificar el tamaño de descarga informado por el Campus.');
  }
  const size = Number(contentLength.trim());
  if (!Number.isSafeInteger(size) || size < 0) {
    throw new Error('El Campus informó un tamaño de descarga no válido.');
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error('El archivo supera el límite local de 50 MiB para extracción.');
  }
  return size;
}
