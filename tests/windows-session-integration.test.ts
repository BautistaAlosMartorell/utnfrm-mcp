import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const describeWindows = process.platform === 'win32' ? describe : describe.skip;

describeWindows('Windows DPAPI SessionStore integration', () => {
  let sessionDir: string;
  let previousSessionDir: string | undefined;

  beforeEach(() => {
    previousSessionDir = process.env.UTN_MCP_SESSION_DIR;
    sessionDir = path.resolve(process.cwd(), `.session-dpapi-integration-${process.pid}-${Date.now()}`);
    process.env.UTN_MCP_SESSION_DIR = sessionDir;
    vi.resetModules();
  });

  afterEach(() => {
    if (previousSessionDir === undefined) delete process.env.UTN_MCP_SESSION_DIR;
    else process.env.UTN_MCP_SESSION_DIR = previousSessionDir;
    fs.rmSync(sessionDir, { recursive: true, force: true });
  });

  it('round-trips and clears a synthetic state through real Windows DPAPI', async () => {
    const { SessionStore } = await import('../src/session/session-store.js');
    const fixture = {
      cookies: [{ name: 'synthetic-cookie', value: 'fixture-value', domain: 'campus.example', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const }],
      origins: []
    };

    await SessionStore.save(fixture);

    const encryptedPath = path.join(sessionDir, 'storageState.dpapi');
    const encryptedContent = fs.readFileSync(encryptedPath, 'utf8');
    expect(encryptedContent.startsWith('UTN-MCP-DPAPI:v1:')).toBe(true);
    expect(encryptedContent).not.toContain('fixture-value');
    expect(fs.existsSync(path.join(sessionDir, 'storageState.json'))).toBe(false);
    expect(await SessionStore.getPlaywrightStorageState()).toEqual(fixture);

    await SessionStore.clear();
    expect(SessionStore.exists()).toBe(false);
    expect(fs.existsSync(encryptedPath)).toBe(false);
  }, 20_000);
});
