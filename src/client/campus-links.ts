import { resolveCampusUrl } from './campus-url.js';

const PLUGINFILE = /(?:href|src|data)\s*=\s*(?:"([^"]*\/pluginfile\.php\/[^"]+)"|'([^']*\/pluginfile\.php\/[^']+)')/gi;
const NOT_A_DOCUMENT = /\/pluginfile\.php\/[^/]+\/(?:user|theme_[^/]+|core[^/]*|course\/(?:overviewfiles|summary)|block_[^/]+|mod_[a-z]+\/intro)\//i;

export type PluginfileCandidate = { url: string; name: string };

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&#0*38;/g, '&');
}

function fileNameOf(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    return decodeURIComponent(last);
  } catch {
    return '';
  }
}

/** Enlaces a archivos reales de Moodle dentro de una página, sin avatares, íconos ni imágenes de tema. */
export function findPluginfileCandidates(html: string, baseUrl?: string): PluginfileCandidate[] {
  const seen = new Set<string>();
  const found: PluginfileCandidate[] = [];
  for (const match of html.matchAll(PLUGINFILE)) {
    const raw = decodeEntities(match[1] ?? match[2] ?? '');
    if (!raw || NOT_A_DOCUMENT.test(raw)) continue;
    let resolved: string;
    try {
      resolved = resolveCampusUrl(raw, baseUrl);
    } catch {
      continue;
    }
    const withoutQuery = resolved.split('?')[0];
    if (seen.has(withoutQuery)) continue;
    seen.add(withoutQuery);
    found.push({ url: resolved, name: fileNameOf(resolved) });
  }
  return found;
}

/**
 * Elige el archivo principal de una vista de recurso (/mod/resource/view.php).
 * Prefiere el contenido del módulo recurso; si la página lista varios archivos de una carpeta,
 * no adivina y devuelve la lista para que el llamador pida una URL concreta.
 */
export function pickResourceFile(html: string, baseUrl?: string): { url?: string; ambiguous: PluginfileCandidate[] } {
  const candidates = findPluginfileCandidates(html, baseUrl);
  const resource = candidates.filter(candidate => /\/mod_resource\/content\//i.test(candidate.url));
  if (resource.length >= 1) return { url: resource[0].url, ambiguous: [] };
  const folder = candidates.filter(candidate => /\/mod_folder\/content\//i.test(candidate.url));
  if (folder.length === 1) return { url: folder[0].url, ambiguous: [] };
  if (folder.length > 1) return { ambiguous: folder };
  if (candidates.length >= 1) return { url: candidates[0].url, ambiguous: [] };
  return { ambiguous: [] };
}

/**
 * Moodle envía Content-Disposition con los bytes UTF-8 interpretados como Latin-1
 * ("RegresiÃ³n" en vez de "Regresión"). Revierte esa doble codificación solo cuando es reversible.
 */
export function repairMojibake(value: string): string {
  if (!/[ÃÂâ][\u0080-¿]|Ã./.test(value)) return value;
  try {
    const bytes = Buffer.from(value, 'latin1');
    const repaired = bytes.toString('utf8');
    return repaired.includes('�') ? value : repaired;
  } catch {
    return value;
  }
}

/** Extrae el nombre de archivo de un encabezado Content-Disposition (RFC 6266 / 5987), ya reparado. */
export function filenameFromContentDisposition(disposition: string): string | undefined {
  if (!disposition) return undefined;
  const extended = disposition.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i);
  if (extended) {
    try {
      return decodeURIComponent(extended[2].trim().replace(/^"|"$/g, ''));
    } catch {
      // continúa con filename=
    }
  }
  const plain = disposition.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  if (!plain) return undefined;
  const raw = (plain[1] ?? plain[2] ?? '').trim();
  if (!raw) return undefined;
  let decoded = raw;
  if (/%[0-9a-f]{2}/i.test(raw)) {
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }
  }
  return repairMojibake(decoded);
}

/** Nombre seguro para guardar en disco: sin separadores, caracteres de control ni nombres reservados. */
export function safeLocalFilename(name: string, fallback = 'archivo'): string {
  const base = name.split(/[\\/]/).pop() || '';
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_')
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 180);
  if (!cleaned || /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned)) return fallback;
  return cleaned;
}
