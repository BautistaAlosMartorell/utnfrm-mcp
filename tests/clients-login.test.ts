import { describe, expect, it, vi } from 'vitest';
import { commandLine, isInstalled, isRegistered, registerClient, registrationArgs, type Runner } from '../src/cli/clients.js';

const run = (result: Partial<ReturnType<Runner>>): Runner => vi.fn(() => ({ status: 0, stdout: '', error: undefined, ...result }));

describe('client registration helpers', () => {
  it('builds each client command with writes disabled and the server entry point', () => {
    for (const id of ['claude', 'codex', 'opencode'] as const) {
      const args = registrationArgs(id);
      expect(args).toContain('UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED=false');
      expect(args).toContain('utn-mendoza');
      expect(args.at(-1)).toMatch(/dist\/index\.js$/);
      expect(args.slice(-3, -1)).toEqual(['--', 'node']);
    }
    expect(registrationArgs('claude')).toEqual(expect.arrayContaining(['--scope', 'user']));
    expect(registrationArgs('opencode')).toContain('--global');
  });

  it('prints instead of running with printOnly and quotes arguments with spaces', () => {
    const runner = run({});
    const result = registerClient('claude', { printOnly: true, run: runner });
    expect(result.ok).toBe(true);
    expect(result.line.startsWith('claude mcp add utn-mendoza')).toBe(true);
    expect(runner).not.toHaveBeenCalled();
    expect(commandLine('x', ['a b', 'c'])).toBe('x "a b" c');
  });

  it('reports a missing binary or a failing registration with a helpful message', () => {
    expect(registerClient('codex', { run: run({ error: new Error('ENOENT') }) })).toMatchObject({ ok: false, message: expect.stringContaining('Instalalo') });
    expect(registerClient('claude', { run: run({ status: 1 }) })).toMatchObject({ ok: false, message: expect.stringContaining('mcp list') });
    expect(registerClient('claude', { run: run({ status: 0 }) }).ok).toBe(true);
  });

  it('detects installed clients and whether the server is registered', () => {
    expect(isInstalled('claude', run({ status: 0 }))).toBe(true);
    expect(isInstalled('claude', run({ status: 1 }))).toBe(false);
    expect(isRegistered('claude', run({ stdout: 'context7: ok\nutn-mendoza: node ... - ✓ Connected\n' }))).toBe(true);
    expect(isRegistered('claude', run({ stdout: 'otro-utn-mendoza-viejo: x\n' }))).toBe(false);
    expect(isRegistered('claude', run({ stdout: 'nada' }))).toBe(false);
    expect(isRegistered('claude', run({ status: 1 }))).toBeUndefined();
  });
});
