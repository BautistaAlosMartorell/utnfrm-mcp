import { describe, expect, it } from 'vitest';
import { CLIENTS } from '../src/cli/clients.js';
import { doctorExitCode, formatDoctor, runDoctor, type DoctorDeps } from '../src/cli/doctor.js';

function deps(overrides: Partial<DoctorDeps> = {}): DoctorDeps {
  return {
    platform: 'linux',
    nodeVersion: '24.19.0',
    env: { DISPLAY: ':0' },
    chromiumPath: () => '/home/alumno/.cache/ms-playwright/chromium-1248/chrome',
    fileExists: () => true,
    hasCommand: () => true,
    probeSecretStorage: async () => undefined,
    sessionExists: () => true,
    sessionSavedAt: () => new Date(Date.now() - 2 * 3_600_000),
    validateSession: async () => ({ valid: true, userName: 'Alumno Privado' }),
    clients: CLIENTS,
    clientInstalled: binary => binary === 'claude',
    clientRegistered: () => true,
    ...overrides
  };
}

const byId = (checks: Awaited<ReturnType<typeof runDoctor>>, id: string) => checks.find(check => check.id === id)!;

describe('doctor', () => {
  it('reports everything green on a healthy machine', async () => {
    const checks = await runDoctor({}, deps());
    expect(checks.filter(check => check.status === 'fail')).toEqual([]);
    expect(byId(checks, 'client-claude').status).toBe('ok');
    expect(byId(checks, 'client-codex').status).toBe('skip');
    expect(doctorExitCode(checks)).toBe(0);
    expect(formatDoctor(checks)).toMatch(/Todo en orden\./);
  });

  it('rejects an old Node and tells the user what to do', async () => {
    const checks = await runDoctor({ machineOnly: true }, deps({ nodeVersion: '20.11.1' }));
    expect(byId(checks, 'node')).toMatchObject({ status: 'fail', fix: expect.stringMatching(/nodejs\.org/) });
    expect(byId(await runDoctor({ machineOnly: true }, deps({ nodeVersion: '22.13.0' })), 'node').status).toBe('ok');
    expect(byId(await runDoctor({ machineOnly: true }, deps({ nodeVersion: '22.12.9' })), 'node').status).toBe('fail');
  });

  it('flags a missing or mismatched Chromium', async () => {
    const checks = await runDoctor({ machineOnly: true }, deps({ fileExists: () => false }));
    expect(byId(checks, 'browser')).toMatchObject({ status: 'fail', fix: 'Ejecutá: utn-mcp-mendoza install-browser' });
    const noPath = await runDoctor({ machineOnly: true }, deps({ chromiumPath: () => undefined }));
    expect(byId(noPath, 'browser').status).toBe('fail');
  });

  it('gives the exact apt command when secret-tool is missing on Linux', async () => {
    const checks = await runDoctor({ machineOnly: true }, deps({ hasCommand: () => false }));
    expect(byId(checks, 'storage')).toMatchObject({ status: 'fail', fix: expect.stringContaining('sudo apt-get install -y libsecret-tools gnome-keyring') });
  });

  it('flags an unresponsive secret store and a missing display', async () => {
    const checks = await runDoctor({ machineOnly: true }, deps({
      probeSecretStorage: async () => { throw new Error('boom'); },
      env: {}
    }));
    expect(byId(checks, 'storage').status).toBe('fail');
    expect(byId(checks, 'display').status).toBe('warn');
    const mac = await runDoctor({ machineOnly: true }, deps({ platform: 'darwin', probeSecretStorage: async () => { throw new Error('x'); } }));
    expect(byId(mac, 'storage').fix).toMatch(/Llavero/);
    expect(mac.some(check => check.id === 'display')).toBe(false);
  });

  it('treats Windows storage as protected without probing', async () => {
    const checks = await runDoctor({ machineOnly: true }, deps({ platform: 'win32', probeSecretStorage: async () => { throw new Error('no debe llamarse'); } }));
    expect(byId(checks, 'storage').status).toBe('ok');
  });

  it('distinguishes no session, expired session, offline mode and legacy sessions', async () => {
    expect(byId(await runDoctor({}, deps({ sessionExists: () => false })), 'session')).toMatchObject({ status: 'fail', fix: 'Ejecutá: utn-mcp-mendoza login' });
    expect(byId(await runDoctor({}, deps({ validateSession: async () => ({ valid: false, error: 'x' }) })), 'session').status).toBe('fail');
    const offline = await runDoctor({ offline: true }, deps({ validateSession: async () => { throw new Error('no debe consultar'); } }));
    expect(byId(offline, 'session').status).toBe('skip');
    const legacy = await runDoctor({}, deps({ sessionExists: () => { throw new Error('Se encontro una sesion antigua sin cifrar.'); } }));
    expect(byId(legacy, 'session')).toMatchObject({ status: 'fail', detail: expect.stringContaining('antigua') });
  });

  it('detects clients that are installed but not connected, or unknown', async () => {
    const notConnected = await runDoctor({}, deps({ clientInstalled: () => true, clientRegistered: binary => binary === 'codex' }));
    expect(byId(notConnected, 'client-claude')).toMatchObject({ status: 'warn', fix: 'Ejecutá: utn-mcp-mendoza setup-claude' });
    expect(byId(notConnected, 'client-codex').status).toBe('ok');
    const unknown = await runDoctor({}, deps({ clientRegistered: () => undefined }));
    expect(byId(unknown, 'client-claude').status).toBe('warn');
    const none = await runDoctor({}, deps({ clientInstalled: () => false }));
    expect(byId(none, 'client-none')).toMatchObject({ status: 'warn', fix: expect.stringContaining('utn-mcp-mendoza setup') });
  });

  it('never prints paths, user names or credentials, so the output can be pasted in a report', async () => {
    const checks = await runDoctor({}, deps({
      fileExists: () => false,
      validateSession: async () => ({ valid: false, error: 'MoodleSession=secreto https://campusvirtual.frm.utn.edu.ar/x' })
    }));
    const text = formatDoctor(checks);
    expect(text).not.toMatch(/alumno|Alumno Privado|ms-playwright|secreto|campusvirtual|\/home\//);
    expect(text).toMatch(/Hay \d+ cosas? para resolver/);
    expect(doctorExitCode(checks)).toBe(1);
  });
});
