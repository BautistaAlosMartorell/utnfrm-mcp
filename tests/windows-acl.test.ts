import { describe, expect, it } from 'vitest';
import { protectWindowsSessionPath } from '../src/session/windows-acl.js';

describe('Windows session ACL', () => {
  it('restricts a session directory to the current user and Local System', () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const run: NonNullable<Parameters<typeof protectWindowsSessionPath>[2]> = (command, args) => {
      calls.push({ command, args });
      return command === 'whoami.exe'
        ? { status: 0, stdout: '"DOMAIN\\student","S-1-5-21-111-222-333-1001"\r\n' }
        : { status: 0, stdout: 'processed' };
    };

    protectWindowsSessionPath('C:\\private\\UTN MCP Mendoza', true, run);

    expect(calls.map(call => call.command)).toEqual(['whoami.exe', 'icacls.exe']);
    expect(calls[1].args).toEqual([
      'C:\\private\\UTN MCP Mendoza',
      '/inheritance:r',
      '/grant:r',
      '*S-1-5-21-111-222-333-1001:(OI)(CI)F',
      '*S-1-5-18:(OI)(CI)F'
    ]);
  });

  it('does not expose command output if Windows cannot apply the ACL', () => {
    const run: NonNullable<Parameters<typeof protectWindowsSessionPath>[2]> = command =>
      command === 'whoami.exe'
        ? { status: 0, stdout: '"DOMAIN\\student","S-1-5-21-111-222-333-1001"\r\n' }
        : { status: 1, stdout: 'storageState secret diagnostic' };

    expect(() => protectWindowsSessionPath('C:\\private\\storageState.json', false, run))
      .toThrow('No se pudieron restringir los permisos de la sesión local en Windows.');
  });
});
