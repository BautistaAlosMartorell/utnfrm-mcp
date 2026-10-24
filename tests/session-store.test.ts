import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paths = vi.hoisted(() => ({ dir: '', plain: '', encrypted: '' }));
const dpapiFixture = vi.hoisted(() => ({ json: '' }));

vi.mock('../src/config.js', () => ({
  get SESSION_DIR() { return paths.dir; },
  get STORAGE_STATE_PATH() { return paths.plain; },
  get ENCRYPTED_STORAGE_STATE_PATH() { return paths.encrypted; }
}));
vi.mock('../src/session/windows-acl.js', () => ({
  protectWindowsSessionPath: vi.fn()
}));
vi.mock('../src/session/windows-dpapi.js', () => ({
  protectWindowsSessionData: (json: string) => {
    dpapiFixture.json = json;
    return 'UTN-MCP-DPAPI:v1:synthetic-ciphertext';
  },
  unprotectWindowsSessionData: (envelope: string) => {
    if (envelope !== 'UTN-MCP-DPAPI:v1:synthetic-ciphertext') throw new Error('fixture de cifrado inválido');
    return dpapiFixture.json;
  }
}));

describe('SessionStore Windows persistence policy', () => {
  let tempDir: string;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-session-store-'));
    paths.dir = path.join(tempDir, 'session');
    paths.plain = path.join(paths.dir, 'storageState.json');
    paths.encrypted = path.join(paths.dir, 'storageState.dpapi');
    dpapiFixture.json = '';
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'win32' });
    vi.resetModules();
  });

  afterEach(() => {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('saves new state encrypted and exposes only the parsed object to Playwright', async () => {
    const { SessionStore } = await import('../src/session/session-store.js');
    const state = { cookies: [{ name: 'synthetic', value: 'fixture' }], origins: [] };

    SessionStore.save(state);

    expect(fs.existsSync(paths.plain)).toBe(false);
    expect(fs.readFileSync(paths.encrypted, 'utf8')).toBe('UTN-MCP-DPAPI:v1:synthetic-ciphertext');
    expect(SessionStore.exists()).toBe(true);
    expect(SessionStore.getStoragePath()).toBe(paths.encrypted);
    expect(SessionStore.getPlaywrightStorageState()).toEqual(state);
  });

  it('keeps an existing legacy JSON session readable without migrating or replacing it', async () => {
    fs.mkdirSync(paths.dir, { recursive: true });
    const original = '{"cookies":[],"origins":[]}';
    fs.writeFileSync(paths.plain, original);
    const { SessionStore } = await import('../src/session/session-store.js');

    expect(SessionStore.getPlaywrightStorageState()).toBe(paths.plain);
    expect(fs.readFileSync(paths.plain, 'utf8')).toBe(original);
    expect(fs.existsSync(paths.encrypted)).toBe(false);
  });

  it('fails closed when an invalid encrypted path exists even if legacy state also exists', async () => {
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.plain, '{"cookies":[],"origins":[]}');
    fs.mkdirSync(paths.encrypted);
    const { SessionStore } = await import('../src/session/session-store.js');

    expect(() => SessionStore.exists()).toThrow(/archivo regular/i);
    expect(() => SessionStore.getPlaywrightStorageState()).toThrow(/archivo regular/i);
    expect(fs.readFileSync(paths.plain, 'utf8')).toBe('{"cookies":[],"origins":[]}');
  });
});
