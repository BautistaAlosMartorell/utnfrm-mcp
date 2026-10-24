import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectSessionFile } from '../src/session/session-files.js';

describe('session file inspection', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it('distinguishes an absent state without following paths', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-session-policy-'));
    expect(inspectSessionFile(path.join(tempDir, 'missing.json'), 1024)).toEqual({ exists: false });
  });

  it('accepts bounded regular files and rejects oversized or empty files', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-session-policy-'));
    const statePath = path.join(tempDir, 'storageState.json');
    fs.writeFileSync(statePath, '{"cookies":[]}');
    expect(inspectSessionFile(statePath, 32)).toEqual({ exists: true, size: 14 });
    expect(() => inspectSessionFile(statePath, 12)).toThrow(/límite permitido/i);
    fs.writeFileSync(statePath, '');
    expect(() => inspectSessionFile(statePath, 32)).toThrow(/vacío/i);
  });

  it('rejects directories instead of treating them as absent session files', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-session-policy-'));
    expect(() => inspectSessionFile(tempDir!, 1024)).toThrow(/archivo regular/i);
  });
});
