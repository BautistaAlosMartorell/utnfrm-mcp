import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SESSION_DIR } from '../config.js';

/**
 * Caché local OPCIONAL de archivos del Campus (UTN_MCP_CACHE=1). Está desactivada por defecto porque
 * guarda material académico sin cifrar. Solo se cachean archivos de módulos recurso/carpeta, cuya URL
 * incluye el número de revisión: si el docente reemplaza el archivo, la URL cambia y no hay datos viejos.
 */
export type CachedDownload = { buffer: Buffer; contentType: string; filename: string; finalUrl: string };

const MAX_CACHE_BYTES = 200 * 1024 * 1024;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CACHEABLE = /\/pluginfile\.php\/\d+\/mod_(?:resource|folder)\/content\/\d+\//i;

export function isCacheEnabled(): boolean {
  return process.env.UTN_MCP_CACHE === '1';
}

export function isCacheableUrl(url: string): boolean {
  return CACHEABLE.test(url);
}

function cacheDir(): string {
  const configured = process.env.UTN_MCP_CACHE_DIR;
  return configured && path.isAbsolute(configured) ? configured : path.join(SESSION_DIR, 'cache');
}

function keyFor(url: string): string {
  return crypto.createHash('sha256').update(url.split('?')[0]).digest('hex');
}

function prune(dir: string): void {
  const entries = fs.readdirSync(dir)
    .filter(name => name.endsWith('.bin'))
    .map(name => {
      const stats = fs.statSync(path.join(dir, name));
      return { name: name.slice(0, -4), size: stats.size, mtime: stats.mtimeMs };
    })
    .sort((a, b) => a.mtime - b.mtime);
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  const now = Date.now();
  for (const entry of entries) {
    if (total <= MAX_CACHE_BYTES && now - entry.mtime <= MAX_AGE_MS) continue;
    for (const extension of ['bin', 'json']) fs.rmSync(path.join(dir, `${entry.name}.${extension}`), { force: true });
    total -= entry.size;
  }
}

export function readCachedDownload(url: string): CachedDownload | undefined {
  if (!isCacheEnabled() || !isCacheableUrl(url)) return undefined;
  try {
    const base = path.join(cacheDir(), keyFor(url));
    const meta = JSON.parse(fs.readFileSync(`${base}.json`, 'utf8')) as {
      contentType?: string; filename?: string; finalUrl?: string; storedAt?: number; size?: number;
    };
    if (!meta.storedAt || Date.now() - meta.storedAt > MAX_AGE_MS) return undefined;
    const buffer = fs.readFileSync(`${base}.bin`);
    if (meta.size !== undefined && meta.size !== buffer.length) return undefined;
    return {
      buffer,
      contentType: meta.contentType || 'application/octet-stream',
      filename: meta.filename || 'archivo',
      finalUrl: meta.finalUrl || url
    };
  } catch {
    return undefined;
  }
}

export function writeCachedDownload(url: string, download: CachedDownload): void {
  if (!isCacheEnabled() || !isCacheableUrl(url) || download.buffer.length > MAX_CACHE_BYTES / 4) return;
  try {
    const dir = cacheDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const base = path.join(dir, keyFor(url));
    fs.writeFileSync(`${base}.bin`, download.buffer, { mode: 0o600 });
    fs.writeFileSync(`${base}.json`, JSON.stringify({
      contentType: download.contentType,
      filename: download.filename,
      finalUrl: download.finalUrl,
      storedAt: Date.now(),
      size: download.buffer.length
    }), { mode: 0o600 });
    prune(dir);
  } catch {
    // La caché es solo una optimización: un fallo nunca debe romper la lectura.
  }
}
