import { parseAutogestionAvisos, type AutogestionAviso } from '../parsers/autogestion-avisos.js';

export const AUTOGESTION_AVISOS_URL = 'https://www4.frm.utn.edu.ar/autogestion-alumnos/';
const MAX_BYTES = 2 * 1024 * 1024;

/** Página pública (sin sesión ni credenciales): solo se lee, con tope de tamaño y de tiempo. */
export async function handleGetAutogestionAvisos(): Promise<{ url: string; avisos: AutogestionAviso[] }> {
  const response = await fetch(AUTOGESTION_AVISOS_URL, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'Mozilla/5.0 (utn-mcp-mendoza)' } });
  if (!response.ok) throw new Error(`El sitio respondió ${response.status}.`);
  const html = await response.text();
  if (html.length > MAX_BYTES) throw new Error('La página de avisos es más grande de lo esperado.');
  const avisos = parseAutogestionAvisos(html);
  if (avisos.length === 0) throw new Error('No encontré avisos en la página; es posible que el sitio haya cambiado.');
  return { url: AUTOGESTION_AVISOS_URL, avisos };
}
