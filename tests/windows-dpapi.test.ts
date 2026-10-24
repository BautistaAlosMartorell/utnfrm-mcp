import { describe, expect, it } from 'vitest';
import { protectWindowsSessionData, unprotectWindowsSessionData } from '../src/session/windows-dpapi.js';

describe('Windows DPAPI session envelope', () => {
  it('keeps payload data off process arguments and round-trips through the DPAPI boundary', () => {
    const fixture = '{"cookies":[{"name":"fixture-cookie","value":"fixture-value"}],"origins":[]}';
    const cipherFixture = Buffer.from('encrypted-fixture').toString('base64');
    const outputs = [cipherFixture, Buffer.from(fixture).toString('base64')];
    const calls: Array<{ command: string; args: string[]; input: string }> = [];
    const run: NonNullable<Parameters<typeof protectWindowsSessionData>[1]> = (command, args, options) => {
      calls.push({ command, args, input: options.input });
      return { status: 0, stdout: outputs.shift()! };
    };

    const envelope = protectWindowsSessionData(fixture, run);
    expect(envelope).toBe('UTN-MCP-DPAPI:v1:' + cipherFixture);
    expect(unprotectWindowsSessionData(envelope, run)).toBe(fixture);
    expect(calls).toHaveLength(2);
    expect(calls.every(call => call.command === 'powershell.exe')).toBe(true);
    expect(calls.every(call => !call.args.join(' ').includes(fixture))).toBe(true);
    expect(calls[0].input).toBe(Buffer.from(fixture).toString('base64'));
  });

  it('rejects malformed envelopes without launching PowerShell', () => {
    let called = false;
    const run: NonNullable<Parameters<typeof protectWindowsSessionData>[1]> = () => {
      called = true;
      return { status: 0, stdout: '' };
    };

    expect(() => unprotectWindowsSessionData('unknown-format', run)).toThrow(/formato desconocido/i);
    expect(called).toBe(false);
  });

  it('fails closed when DPAPI returns malformed output', () => {
    const run: NonNullable<Parameters<typeof protectWindowsSessionData>[1]> = () => ({ status: 0, stdout: 'not base64!' });
    expect(() => protectWindowsSessionData('{"fixture":true}', run)).toThrow(/no se pudo cifrar/i);
  });
});
