import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const paths = vi.hoisted(() => ({ dir: '', plain: '', encrypted: '', secure: '' }));
const dpapiFixture = vi.hoisted(() => ({ json: '' }));
const keyring = vi.hoisted(() => ({ values: new Map<string, string>(), unavailable: false }));
const hostPlatform = process.platform;

vi.mock('../src/config.js', () => ({
  get SESSION_DIR() { return paths.dir; },
  get STORAGE_STATE_PATH() { return paths.plain; },
  get ENCRYPTED_STORAGE_STATE_PATH() { return paths.encrypted; },
  get SECURE_STORAGE_STATE_PATH() { return paths.secure; }
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
vi.mock('just-secrets', () => ({
  secrets: {
    get: async ({ name }: { name: string }) => { if (keyring.unavailable) throw new Error('store unavailable'); return keyring.values.get(name) ?? null; },
    set: async ({ name, value }: { name: string; value: string }) => { if (keyring.unavailable) throw new Error('store unavailable'); keyring.values.set(name, value); },
    delete: async ({ name }: { name: string }) => { if (keyring.unavailable) throw new Error('store unavailable'); return keyring.values.delete(name); }
  }
}));

describe('SessionStore platform persistence policy', () => {
  let tempDir: string;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-session-store-'));
    paths.dir = path.join(tempDir, 'session');
    paths.plain = path.join(paths.dir, 'storageState.json');
    paths.encrypted = path.join(paths.dir, 'storageState.dpapi');
    paths.secure = path.join(paths.dir, 'storageState.enc');
    dpapiFixture.json = '';
    keyring.values.clear();
    keyring.unavailable = false;
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

    await SessionStore.save(state);

    expect(fs.existsSync(paths.plain)).toBe(false);
    expect(fs.readFileSync(paths.encrypted, 'utf8')).toBe('UTN-MCP-DPAPI:v1:synthetic-ciphertext');
    expect(SessionStore.exists()).toBe(true);
    expect(SessionStore.getStoragePath()).toBe(paths.encrypted);
    expect(await SessionStore.getPlaywrightStorageState()).toEqual(state);
  });

  it('keeps an existing legacy JSON session readable without migrating or replacing it', async () => {
    fs.mkdirSync(paths.dir, { recursive: true });
    const original = '{"cookies":[],"origins":[]}';
    fs.writeFileSync(paths.plain, original);
    const { SessionStore } = await import('../src/session/session-store.js');

    expect(await SessionStore.getPlaywrightStorageState()).toBe(paths.plain);
    expect(fs.readFileSync(paths.plain, 'utf8')).toBe(original);
    expect(fs.existsSync(paths.encrypted)).toBe(false);
  });

  it('fails closed when an invalid encrypted path exists even if legacy state also exists', async () => {
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.plain, '{"cookies":[],"origins":[]}');
    fs.mkdirSync(paths.encrypted);
    const { SessionStore } = await import('../src/session/session-store.js');

    expect(() => SessionStore.exists()).toThrow(/archivo regular/i);
    await expect(SessionStore.getPlaywrightStorageState()).rejects.toThrow(/archivo regular/i);
    expect(fs.readFileSync(paths.plain, 'utf8')).toBe('{"cookies":[],"origins":[]}');
  });

  it('encrypts non-Windows sessions and leaves a 0600 ciphertext file', async () => {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
    const { SessionStore } = await import('../src/session/session-store.js');
    const state = { cookies: [{ name: 'synthetic', value: 'do-not-write-in-clear' }], origins: [] };

    await SessionStore.save(state);

    const contents = fs.readFileSync(path.join(paths.dir, 'storageState.enc'), 'utf8');
    expect(contents).not.toContain('do-not-write-in-clear');
    expect(fs.existsSync(paths.plain)).toBe(false);
    if (hostPlatform !== 'win32') expect(fs.statSync(path.join(paths.dir, 'storageState.enc')).mode & 0o777).toBe(0o600);
    expect(await SessionStore.getPlaywrightStorageState()).toEqual(state);
    await SessionStore.clear();
    expect(SessionStore.exists()).toBe(false);
    expect(keyring.values.size).toBe(0);
  });

  it('fails closed when the OS keyring is unavailable', async () => {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'darwin' });
    keyring.unavailable = true;
    const { SessionStore } = await import('../src/session/session-store.js');
    const state = { cookies: [{ name: 'synthetic', value: 'never-on-disk' }], origins: [] };

    await expect(SessionStore.save(state)).rejects.toThrow(/almacen seguro/i);
    expect(fs.existsSync(paths.plain)).toBe(false);
    expect(fs.existsSync(path.join(paths.dir, 'storageState.enc'))).toBe(false);
  });

  it('refuses an existing plaintext session on non-Windows', async () => {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
    fs.mkdirSync(paths.dir, { recursive: true });
    fs.writeFileSync(paths.plain, '{"cookies":[],"origins":[]}');
    const { SessionStore } = await import('../src/session/session-store.js');

    expect(() => SessionStore.exists()).toThrow(/sesion antigua sin cifrar/i);
    await expect(SessionStore.save({ cookies: [], origins: [] })).rejects.toThrow(/logout/i);
    expect(fs.readFileSync(paths.plain, 'utf8')).toBe('{"cookies":[],"origins":[]}');
  });

  it('scopes keyring keys to each session directory', async () => {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
    const firstState = { cookies: [{ name: 'first', value: 'first-cookie' }], origins: [] };
    const secondState = { cookies: [{ name: 'second', value: 'second-cookie' }], origins: [] };
    const firstDir = paths.dir;
    const firstSecure = paths.secure;
    const firstModule = await import('../src/session/session-store.js');
    await firstModule.SessionStore.save(firstState);

    paths.dir = path.join(tempDir, 'other-session');
    paths.secure = path.join(paths.dir, 'storageState.enc');
    vi.resetModules();
    const secondModule = await import('../src/session/session-store.js');
    await secondModule.SessionStore.save(secondState);
    expect(keyring.values.size).toBe(2);

    paths.dir = firstDir;
    paths.secure = firstSecure;
    vi.resetModules();
    const firstClearModule = await import('../src/session/session-store.js');
    await firstClearModule.SessionStore.clear();

    paths.dir = path.join(tempDir, 'other-session');
    paths.secure = path.join(paths.dir, 'storageState.enc');
    vi.resetModules();
    const secondReadModule = await import('../src/session/session-store.js');
    expect(await secondReadModule.SessionStore.getPlaywrightStorageState()).toEqual(secondState);
    expect(keyring.values.size).toBe(1);
  });

  it('allows logout to remove an empty invalid encrypted file', async () => {
    Object.defineProperty(process, 'platform', { ...originalPlatform, value: 'linux' });
    const { SessionStore } = await import('../src/session/session-store.js');
    await SessionStore.save({ cookies: [], origins: [] });
    fs.writeFileSync(paths.secure, '');

    await expect(SessionStore.clear()).resolves.toBeUndefined();
    expect(fs.existsSync(paths.secure)).toBe(false);
    expect(keyring.values.size).toBe(0);
  });
});
