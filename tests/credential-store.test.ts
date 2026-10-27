import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionDir, vault, failing } = vi.hoisted(() => {
  const dir = `${process.env.TMPDIR ?? '/tmp'}/utn-mcp-credstore-${process.pid}`;
  process.env.UTN_MCP_SESSION_DIR = dir;
  return { sessionDir: dir, vault: new Map<string, string>(), failing: { value: false } };
});

vi.mock('just-secrets', () => ({
  secrets: {
    set: async ({ service, name, value }: { service: string; name: string; value: string }) => {
      if (failing.value) throw new Error('no secret service');
      vault.set(`${service}/${name}`, value);
    },
    get: async ({ service, name }: { service: string; name: string }) => {
      if (failing.value) throw new Error('no secret service');
      return vault.get(`${service}/${name}`) ?? null;
    },
    delete: async ({ service, name }: { service: string; name: string }) => vault.delete(`${service}/${name}`)
  }
}));

const { CredentialStore } = await import('../src/session/credential-store.js');

const fixture = { username: '12345678', password: 'fixture-clave-ñ', email: 'fixture@alumnos.example' };

beforeEach(async () => {
  vault.clear();
  failing.value = false;
  await CredentialStore.clear();
});

afterAll(() => fs.rmSync(sessionDir, { recursive: true, force: true }));

describe('CredentialStore', () => {
  it('returns null before anything was saved', async () => {
    expect(await CredentialStore.get()).toBeNull();
  });

  it('round-trips credentials and clears them', async () => {
    await CredentialStore.save(fixture);
    expect(await CredentialStore.get()).toEqual(fixture);
    await CredentialStore.clear();
    expect(await CredentialStore.get()).toBeNull();
  });

  it('never leaves the password in the session directory', async () => {
    await CredentialStore.save(fixture);
    const files = fs.existsSync(sessionDir) ? fs.readdirSync(sessionDir) : [];
    for (const file of files) {
      expect(fs.readFileSync(path.join(sessionDir, file), 'utf8')).not.toContain(fixture.password);
    }
  });

  it('rejects empty and oversized input', async () => {
    await expect(CredentialStore.save({ username: '', password: 'x' })).rejects.toThrow(/obligatorios/);
    await expect(CredentialStore.save({ username: 'u', password: 'x'.repeat(3000) })).rejects.toThrow(/largos/);
  });

  it.skipIf(process.platform === 'win32')('fails closed, not as "missing", when the system store is unavailable', async () => {
    failing.value = true;
    await expect(CredentialStore.save(fixture)).rejects.toThrow(/almacen seguro/);
    await expect(CredentialStore.get()).rejects.toThrow(/almacen seguro/);
  });

  it.skipIf(process.platform === 'win32')('reports corrupt stored values instead of returning them', async () => {
    await CredentialStore.save(fixture);
    for (const key of vault.keys()) vault.set(key, '{"username":1}');
    await expect(CredentialStore.get()).rejects.toThrow(/danadas/);
  });
});

// En Windows el mock de just-secrets no se usa: los tests de arriba ejercitan DPAPI real sobre un directorio temporal.
