import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSessionDir } from '../src/session/paths.js';

describe('session directory selection', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  });

  it.each(['linux', 'darwin', 'win32'] as const)('selects a legacy project session on %s without reading it', (platform) => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-legacy-session-path-'));
    const projectSessionDir = path.join(tempDir, '.session');
    fs.mkdirSync(projectSessionDir);
    fs.writeFileSync(path.join(projectSessionDir, 'storageState.json'), 'synthetic legacy content');

    expect(resolveSessionDir({
      platform,
      projectSessionDir,
      userStateDir: path.join(tempDir, 'new-state'),
      legacyMacUserStateDir: path.join(tempDir, 'old-mac-state')
    })).toBe(projectSessionDir);
  });

  it('selects the previous macOS state directory so logout can remove a legacy plaintext session', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-legacy-mac-session-'));
    const legacyMacUserStateDir = path.join(tempDir, '.local', 'state', 'utn-mcp-mendoza');
    fs.mkdirSync(legacyMacUserStateDir, { recursive: true });
    fs.writeFileSync(path.join(legacyMacUserStateDir, 'storageState.json'), 'synthetic legacy content');

    expect(resolveSessionDir({
      platform: 'darwin',
      projectSessionDir: path.join(tempDir, 'missing-project-session'),
      userStateDir: path.join(tempDir, 'Library', 'Application Support', 'UTN FRM MCP'),
      legacyMacUserStateDir
    })).toBe(legacyMacUserStateDir);
    expect(resolveSessionDir({
      platform: 'linux',
      projectSessionDir: path.join(tempDir, 'missing-project-session'),
      userStateDir: path.join(tempDir, 'new-linux-state'),
      legacyMacUserStateDir
    })).toBe(path.join(tempDir, 'new-linux-state'));
  });

  it('keeps an explicit session directory ahead of legacy locations', () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-explicit-session-path-'));
    const projectSessionDir = path.join(tempDir, '.session');
    fs.mkdirSync(projectSessionDir);
    fs.writeFileSync(path.join(projectSessionDir, 'storageState.json'), 'synthetic legacy content');
    const override = path.join(tempDir, 'custom-state');

    expect(resolveSessionDir({
      platform: 'darwin',
      override,
      projectSessionDir,
      userStateDir: path.join(tempDir, 'new-state'),
      legacyMacUserStateDir: path.join(tempDir, 'old-mac-state')
    })).toBe(path.resolve(override));
  });
});
