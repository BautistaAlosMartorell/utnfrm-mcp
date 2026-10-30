import { describe, expect, it } from 'vitest';
import { COMMANDS, GROUPS, commandHelp, findCommand, helpText, unknownFlags } from '../src/cli/commands.js';

describe('cli commands catalog', () => {
  it('has unique names, known groups and every group in use', () => {
    const names = COMMANDS.flatMap(command => [command.name, ...(command.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
    expect(COMMANDS.every(command => GROUPS.includes(command.group))).toBe(true);
    expect(GROUPS.every(group => COMMANDS.some(command => command.group === group))).toBe(true);
  });

  it('finds commands by name or alias', () => {
    expect(findCommand('init')?.name).toBe('setup-wizard');
    expect(findCommand('install-deps')?.name).toBe('install-deps');
    expect(findCommand('nope')).toBeUndefined();
  });

  it('the help lists every command grouped, plus the general flags', () => {
    const text = helpText('9.9.9');
    expect(text).toContain('utn-mcp-mendoza 9.9.9');
    for (const command of COMMANDS) expect(text).toContain(command.usage ?? command.name);
    expect(text).toMatch(/Empezar:[\s\S]*Sesión:[\s\S]*Instalación:[\s\S]*Conectar tu cliente de IA:[\s\S]*Uso:/);
    expect(text).toMatch(/-h, --help/);
    expect(text).toMatch(/-v, --version/);
  });

  it('shows the flags of one command', () => {
    expect(commandHelp(findCommand('digest')!)).toMatch(/--days=<n>[\s\S]*--notify[\s\S]*--json[\s\S]*--all-courses/);
    expect(commandHelp(findCommand('setup-wizard')!)).toContain('Alias: init');
    expect(commandHelp(findCommand('login')!)).not.toContain('Flags:');
  });

  it('detects flags a command does not declare, and accepts the declared ones', () => {
    const digest = findCommand('digest')!;
    expect(unknownFlags(digest, ['--days=14', '--json', '--help'])).toEqual([]);
    expect(unknownFlags(digest, ['--day=14', '--jsno'])).toEqual(['--day=14', '--jsno']);
    expect(unknownFlags(findCommand('install-deps')!, ['-y'])).toEqual([]);
    expect(unknownFlags(findCommand('login')!, ['--yes'])).toEqual(['--yes']);
    expect(unknownFlags(findCommand('approve-assignment')!, ['abc123'])).toEqual([]);
  });
});
