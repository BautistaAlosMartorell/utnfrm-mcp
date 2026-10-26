import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const campus = vi.hoisted(() => ({ downloadBuffer: vi.fn() }));
vi.mock('../src/client/campus-client.js', () => ({ campusClient: campus }));

import { downloadDirectory, handleDownloadFile } from '../src/tools/download-file.js';

describe('download_file', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-dl-'));
    process.env.UTN_MCP_DOWNLOAD_DIR = dir;
    campus.downloadBuffer.mockReset();
    campus.downloadBuffer.mockResolvedValue({
      buffer: Buffer.from('%PDF-1.7 demo'), contentType: 'application/pdf', filename: 'Apunte.pdf', finalUrl: 'x', status: 200
    });
  });

  afterEach(() => {
    delete process.env.UTN_MCP_DOWNLOAD_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('saves into the configured folder and never overwrites an existing file', async () => {
    const first = await handleDownloadFile({ url: '/mod/resource/view.php?id=1' });
    const second = await handleDownloadFile({ url: '/mod/resource/view.php?id=1' });
    expect(first.path).toBe(path.join(dir, 'Apunte.pdf'));
    expect(second.path).toBe(path.join(dir, 'Apunte (1).pdf'));
    expect(fs.readFileSync(first.path, 'utf8')).toBe('%PDF-1.7 demo');
    expect(first.bytes).toBe(13);
    if (process.platform !== 'win32') expect(fs.statSync(first.path).mode & 0o777).toBe(0o600);
  });

  it('keeps writes inside the folder even with hostile file names', async () => {
    const result = await handleDownloadFile({ url: '/x', filename: '../../outside.pdf' });
    expect(path.dirname(result.path)).toBe(dir);
    expect(result.filename).toBe('outside.pdf');
    campus.downloadBuffer.mockResolvedValueOnce({ buffer: Buffer.from('x'), contentType: 'text/plain', filename: '..\\..\\x.txt', finalUrl: 'x', status: 200 });
    const second = await handleDownloadFile({ url: '/y' });
    expect(path.dirname(second.path)).toBe(dir);
  });

  it('requires an absolute download directory', () => {
    process.env.UTN_MCP_DOWNLOAD_DIR = 'relative/dir';
    expect(() => downloadDirectory()).toThrow(/ruta absoluta/);
  });
});
