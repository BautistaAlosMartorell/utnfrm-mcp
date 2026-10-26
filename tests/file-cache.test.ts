import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCacheableUrl, readCachedDownload, writeCachedDownload } from '../src/client/file-cache.js';

const URL_OK = 'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/55/mod_resource/content/2/a.pdf?forcedownload=1';
const sample = { buffer: Buffer.from('contenido'), contentType: 'application/pdf', filename: 'a.pdf', finalUrl: URL_OK };

describe('opt-in file cache', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-cache-'));
    process.env.UTN_MCP_CACHE_DIR = dir;
  });
  afterEach(() => {
    delete process.env.UTN_MCP_CACHE;
    delete process.env.UTN_MCP_CACHE_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is disabled unless UTN_MCP_CACHE=1', () => {
    writeCachedDownload(URL_OK, sample);
    expect(fs.readdirSync(dir)).toHaveLength(0);
    expect(readCachedDownload(URL_OK)).toBeUndefined();
  });

  it('round-trips a download and ignores the query string', () => {
    process.env.UTN_MCP_CACHE = '1';
    writeCachedDownload(URL_OK, sample);
    const hit = readCachedDownload(URL_OK.replace('?forcedownload=1', ''));
    expect(hit?.buffer.toString()).toBe('contenido');
    expect(hit).toMatchObject({ contentType: 'application/pdf', filename: 'a.pdf' });
  });

  it('only caches revisioned module files', () => {
    process.env.UTN_MCP_CACHE = '1';
    expect(isCacheableUrl(URL_OK)).toBe(true);
    expect(isCacheableUrl('https://campusvirtual.frm.utn.edu.ar/pluginfile.php/490/user/icon/boost/f1')).toBe(false);
    expect(isCacheableUrl('https://campusvirtual.frm.utn.edu.ar/mod/resource/view.php?id=1')).toBe(false);
    writeCachedDownload('https://campusvirtual.frm.utn.edu.ar/mod/resource/view.php?id=1', sample);
    expect(fs.readdirSync(dir)).toHaveLength(0);
  });

  it('discards a corrupted entry', () => {
    process.env.UTN_MCP_CACHE = '1';
    writeCachedDownload(URL_OK, sample);
    const bin = fs.readdirSync(dir).find(name => name.endsWith('.bin'))!;
    fs.writeFileSync(path.join(dir, bin), 'truncado');
    expect(readCachedDownload(URL_OK)).toBeUndefined();
  });
});
