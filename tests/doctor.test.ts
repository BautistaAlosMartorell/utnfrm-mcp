import { describe, expect, it } from 'vitest';
import { doctorExitCode, formatDoctor, runDoctor, type DoctorProbes } from '../src/cli/doctor.js';

const healthy: DoctorProbes = {
  platform: 'linux',
  nodeVersion: '22.13.0',
  chromiumInstalled: () => true,
  secretToolAvailable: () => true,
  hasLocalSession: () => true,
  sessionValid: async () => true,
  clientState: binary => (binary === 'claude' ? 'registered' : 'missing')
};

const statusOf = (checks: Awaited<ReturnType<typeof runDoctor>>, name: string) =>
  checks.find(check => check.name === name)?.status;

describe('doctor', () => {
  it('reports a healthy setup with exit code 0', async () => {
    const checks = await runDoctor(healthy);
    expect(doctorExitCode(checks)).toBe(0);
    expect(statusOf(checks, 'Claude Code')).toBe('ok');
    expect(statusOf(checks, 'Codex')).toBe('skip');
    expect(formatDoctor(checks)).toMatch(/Todo en orden/);
  });

  it('flags each broken piece with a concrete action', async () => {
    const checks = await runDoctor({
      ...healthy,
      nodeVersion: '20.1.0',
      chromiumInstalled: () => false,
      secretToolAvailable: () => false,
      hasLocalSession: () => false
    });
    expect(doctorExitCode(checks)).toBe(1);
    for (const name of ['Node.js', 'Chromium', 'Almacén de contraseñas', 'Sesión local']) {
      expect(statusOf(checks, name)).toBe('fail');
    }
    expect(statusOf(checks, 'Sesión en el Campus')).toBe('skip');
    expect(checks.filter(check => check.status === 'fail').every(check => check.action)).toBe(true);
  });

  it('treats an expired Campus session as a failure and a network error as a warning', async () => {
    const expired = await runDoctor({ ...healthy, sessionValid: async () => false });
    expect(statusOf(expired, 'Sesión en el Campus')).toBe('fail');

    const offline = await runDoctor({ ...healthy, sessionValid: async () => { throw new Error('ENOTFOUND campusvirtual.frm.utn.edu.ar'); } });
    expect(statusOf(offline, 'Sesión en el Campus')).toBe('warn');
    expect(doctorExitCode(offline)).toBe(0);
    expect(formatDoctor(offline)).not.toMatch(/ENOTFOUND|campusvirtual/);
  });

  it('suggests the setup command for a detected but unregistered client', async () => {
    const checks = await runDoctor({ ...healthy, clientState: () => 'unregistered' });
    expect(checks.find(check => check.name === 'OpenCode')?.action).toMatch(/setup-opencode/);
  });

  it('skips the keyring check outside Linux and compares Node versions numerically', async () => {
    const checks = await runDoctor({ ...healthy, platform: 'win32', nodeVersion: '22.9.0' });
    expect(checks.some(check => check.name === 'Almacén de contraseñas')).toBe(false);
    expect(statusOf(checks, 'Node.js')).toBe('fail');
    expect(statusOf(await runDoctor({ ...healthy, nodeVersion: '24.0.0' }), 'Node.js')).toBe('ok');
  });
});
