import { describe, expect, it } from 'vitest';
import { planDependencyInstall } from '../src/cli/system-deps.js';

const PW = ['/usr/bin/node', '/x/playwright/cli.js'];
const plan = (commands: string[], isRoot = false) => planDependencyInstall({ has: command => commands.includes(command), isRoot, playwrightCommand: PW });

describe('planDependencyInstall', () => {
  it('apt delegates the package names to Playwright, escalated with sudo', () => {
    expect(plan(['apt-get', 'sudo'])).toEqual({ ok: true, manager: 'apt', argv: ['sudo', ...PW, 'install-deps', 'chromium'] });
  });

  it('dnf and pacman install their own list, with doas or pkexec when there is no sudo', () => {
    const dnf = plan(['dnf', 'doas']);
    expect(dnf).toMatchObject({ ok: true, manager: 'dnf' });
    expect(dnf.ok && dnf.argv.slice(0, 4)).toEqual(['doas', 'dnf', 'install', '-y']);
    const pacman = plan(['pacman', 'pkexec']);
    expect(pacman.ok && pacman.argv.slice(0, 5)).toEqual(['pkexec', 'pacman', '-S', '--needed', '--noconfirm']);
    expect(pacman.ok && pacman.argv).toContain('nss');
  });

  it('prefers sudo over doas over pkexec', () => {
    expect(plan(['dnf', 'pkexec', 'doas', 'sudo'])).toMatchObject({ argv: expect.arrayContaining(['sudo']) });
    expect(plan(['dnf', 'pkexec', 'doas']).ok && (plan(['dnf', 'pkexec', 'doas']) as { argv: string[] }).argv[0]).toBe('doas');
  });

  it('as root runs the manager directly', () => {
    const root = plan(['pacman'], true);
    expect(root.ok && root.argv[0]).toBe('pacman');
  });

  it('says what is missing: no privilege tool, or no known package manager', () => {
    expect(plan(['dnf'])).toMatchObject({ ok: false, reason: 'no-privilege', message: expect.stringContaining('sudo, doas ni pkexec') });
    expect(plan(['zypper', 'sudo'])).toMatchObject({ ok: false, reason: 'unsupported', message: expect.stringContaining('apt, dnf o pacman') });
  });
});
