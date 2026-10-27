import * as cheerio from 'cheerio';
import { campusClient } from '../client/campus-client.js';
import { resolveCampusUrl } from '../client/campus-url.js';
import { requireMoodleId } from '../client/moodle-id.js';

/**
 * Lectura de enlaces externos que la cátedra publica (notebooks y repositorios públicos).
 * Solo se contactan los sitios de la lista de permitidos; para sumar uno hay que agregarlo a
 * UTN_MCP_EXTERNAL_ALLOW (nombres de host separados por coma): esa es la aprobación explícita de cada sitio.
 * No se envían cookies, credenciales ni datos del Campus: solo la dirección pública.
 */
export const DEFAULT_ALLOWED_HOSTS = ['github.com', 'raw.githubusercontent.com', 'gist.github.com', 'gist.githubusercontent.com', 'colab.research.google.com'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_CHARS = 150_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;
const MAX_OUTPUT_CHARS = 1500;

export function allowedHosts(env: NodeJS.ProcessEnv = process.env): string[] {
  const extra = (env.UTN_MCP_EXTERNAL_ALLOW ?? '').split(',').map(host => host.trim().toLowerCase()).filter(host => /^[a-z0-9.-]+$/.test(host) && host.includes('.'));
  return [...new Set([...DEFAULT_ALLOWED_HOSTS, ...extra])];
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/** Convierte las URLs "de vista" (GitHub, Gist, Colab de GitHub) en la URL del contenido en bruto. */
export function toRawUrl(input: URL): URL {
  const parts = input.pathname.split('/').filter(Boolean);
  if (input.hostname === 'github.com') {
    if (parts[2] === 'blob' && parts.length >= 5) return new URL(`https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts[3]}/${parts.slice(4).join('/')}`);
    if (parts.length === 2) return new URL(`https://raw.githubusercontent.com/${parts[0]}/${parts[1].replace(/\.git$/, '')}/HEAD/README.md`);
    if (parts[2] === 'tree' || parts.length > 2) {
      throw new Error('Para leer un archivo de GitHub usá su URL (…/blob/<rama>/<archivo>); las carpetas no se pueden leer completas.');
    }
  }
  if (input.hostname === 'gist.github.com' && parts.length >= 2) return new URL(`https://gist.githubusercontent.com/${parts[0]}/${parts[1]}/raw`);
  if (input.hostname === 'colab.research.google.com') {
    if (parts[0] === 'github' && parts.length >= 5 && parts[3] === 'blob') {
      return new URL(`https://raw.githubusercontent.com/${parts[1]}/${parts[2]}/${parts[4]}/${parts.slice(5).join('/')}`);
    }
    throw new Error('Este cuaderno de Colab está en Google Drive y requiere una cuenta: solo se pueden leer los que están en GitHub (colab.research.google.com/github/…).');
  }
  return input;
}

export type ExternalFetch = (url: string, init: { redirect: 'manual'; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

export interface ExternalDeps {
  fetch: ExternalFetch;
  resolveModule: (pathOrUrl: string) => Promise<string>;
  env: NodeJS.ProcessEnv;
}

const defaultDeps: ExternalDeps = {
  fetch: (url, init) => fetch(url, init),
  resolveModule: pathOrUrl => campusClient.resolveUrlModule(pathOrUrl),
  env: process.env
};

function assertAllowed(url: URL, env: NodeJS.ProcessEnv): void {
  if (url.protocol !== 'https:' || url.username || url.password || isIpLiteral(url.hostname)) {
    throw new Error('Solo se leen direcciones https de sitios con nombre, sin usuario ni contraseña.');
  }
  if (!allowedHosts(env).includes(url.hostname.toLowerCase())) {
    throw new Error(`El sitio ${url.hostname} no está en la lista de sitios permitidos (${allowedHosts(env).join(', ')}). Si querés que se pueda leer, agregalo a la variable UTN_MCP_EXTERNAL_ALLOW.`);
  }
}

async function readLimited(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw new Error('El archivo externo supera los 5 MiB.');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error('El archivo externo supera los 5 MiB.');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

type NotebookCell = { cell_type?: string; source?: string | string[]; outputs?: Array<{ output_type?: string; text?: string | string[]; data?: Record<string, string | string[]>; ename?: string; evalue?: string }> };

const asText = (value: string | string[] | undefined): string => (Array.isArray(value) ? value.join('') : value ?? '');

/** Cuaderno Jupyter → Markdown: texto, código y resultados de texto (se omiten imágenes y salidas largas). */
export function notebookToMarkdown(source: string): string {
  const notebook = JSON.parse(source) as { cells?: NotebookCell[]; metadata?: { kernelspec?: { language?: string } } };
  const language = notebook.metadata?.kernelspec?.language ?? 'python';
  const parts: string[] = [];
  (notebook.cells ?? []).forEach((cell, index) => {
    const text = asText(cell.source).trimEnd();
    if (cell.cell_type === 'markdown') {
      if (text) parts.push(text);
    } else if (cell.cell_type === 'code') {
      if (text) parts.push('```' + language + '\n' + text + '\n```');
      for (const output of cell.outputs ?? []) {
        const printed = output.output_type === 'error'
          ? `${output.ename ?? 'Error'}: ${output.evalue ?? ''}`
          : asText(output.text) || asText(output.data?.['text/plain']);
        if (printed.trim()) parts.push(`_Salida de la celda ${index + 1}:_\n\n` + '```\n' + printed.trim().slice(0, MAX_OUTPUT_CHARS) + (printed.length > MAX_OUTPUT_CHARS ? '\n…' : '') + '\n```');
      }
    }
  });
  return parts.join('\n\n');
}

export interface ExternalResult {
  kind: 'notebook' | 'markdown' | 'code' | 'text' | 'html';
  host: string;
  finalPath: string;
  contentMarkdown: string;
  characters: number;
  truncated: boolean;
}

function isCampusReference(value: string): boolean {
  if (/^\d{1,12}$/.test(value) || value.startsWith('/')) return true;
  try {
    return new URL(value).origin === new URL(resolveCampusUrl('/')).origin;
  } catch {
    return false;
  }
}

/** Lee un enlace externo permitido. Acepta una URL externa directa o un módulo "URL" del Campus (id o enlace). */
export async function handleReadExternal(input: { url: string }, deps: ExternalDeps = defaultDeps): Promise<ExternalResult> {
  let target = input.url.trim();
  if (isCampusReference(target)) {
    const modulePath = /^\d{1,12}$/.test(target) ? `/mod/url/view.php?id=${target}` : `/mod/url/view.php?id=${requireMoodleId(target)}`;
    target = await deps.resolveModule(modulePath);
  }

  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new Error('La dirección no es válida.');
  }
  // La dirección original también debe ser válida: así un enlace http o con credenciales no se "arregla" en silencio.
  assertAllowed(url, deps.env);
  url = toRawUrl(url);

  let response: Response | undefined;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    assertAllowed(url, deps.env);
    response = await deps.fetch(url.href, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'utn-mcp-mendoza (lectura de material público)', Accept: 'text/*, application/json, application/x-ipynb+json' }
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('location');
    if (!location || hop === MAX_REDIRECTS) throw new Error('El sitio externo redirigió demasiadas veces.');
    url = toRawUrl(new URL(location, url));
  }
  if (!response || !response.ok) throw new Error(`El sitio externo respondió con HTTP ${response?.status ?? '?'}.`);

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const name = url.pathname.toLowerCase();
  const body = await readLimited(response);

  let kind: ExternalResult['kind'];
  let markdown: string;
  if (name.endsWith('.ipynb')) {
    kind = 'notebook';
    try {
      markdown = notebookToMarkdown(body);
    } catch {
      throw new Error('No se pudo interpretar el cuaderno (.ipynb): el archivo no es un cuaderno Jupyter válido.');
    }
  } else if (/\.(md|markdown|rst)$/.test(name) || (name.endsWith('/readme.md'))) {
    kind = 'markdown';
    markdown = body;
  } else if (/\.(py|js|ts|java|c|cpp|h|r|sql|sh|ipynb|json|csv|yml|yaml|toml|ini|txt)$/.test(name) || contentType.startsWith('text/plain') || contentType.includes('json')) {
    const extension = name.match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    kind = extension && extension !== 'txt' && extension !== 'csv' && extension !== 'json' ? 'code' : 'text';
    markdown = kind === 'code' ? '```' + extension + '\n' + body + '\n```' : body;
  } else if (contentType.includes('html')) {
    kind = 'html';
    const $ = cheerio.load(body);
    $('script, style, nav, header, footer, noscript').remove();
    markdown = $('main, article, body').first().text().replace(/\n{3,}/g, '\n\n').replace(/[ \t]+/g, ' ').trim();
  } else {
    throw new Error(`No se puede leer este tipo de contenido externo (${contentType || 'desconocido'}).`);
  }

  const truncated = markdown.length > MAX_CHARS;
  return {
    kind,
    host: url.hostname,
    finalPath: url.pathname,
    contentMarkdown: truncated ? markdown.slice(0, MAX_CHARS) + '\n\n… [contenido truncado]' : markdown,
    characters: markdown.length,
    truncated
  };
}
