import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ spawnSync: vi.fn(), has: new Set<string>() }));
vi.mock('node:child_process', async importOriginal => ({ ...(await importOriginal<typeof import('node:child_process')>()), spawnSync: h.spawnSync }));
vi.mock('../src/cli/clients.js', () => ({ isInstalled: (command: string) => h.has.has(command) }));

const { installSystemDeps } = await import('../src/cli/install-deps.js');
const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
const realGetuid = process.getuid;
const realTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');

const commands = () => h.spawnSync.mock.calls.map(call => [call[0], ...(call[1] as string[])].join(' '));
const printed = () => (console.log as ReturnType<typeof vi.fn>).mock.calls.flat().join('\n');

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  h.spawnSync.mockReset().mockReturnValue({ status: 0 });
  h.has = new Set(['pacman', 'doas']);
  Object.defineProperty(process, 'platform', { value: 'linux' });
  process.getuid = () => 1000;
});

afterEach(() => {
  Object.defineProperty(process, 'platform', realPlatform);
  process.getuid = realGetuid;
  if (realTty) Object.defineProperty(process.stdin, 'isTTY', realTty); else delete (process.stdin as { isTTY?: boolean }).isTTY;
  vi.restoreAllMocks();
});

describe('installSystemDeps', () => {
  it('goes step by step, shows the exact command and runs it only after confirmation', () => {
    const confirm = vi.fn(() => true);
    expect(installSystemDeps({ confirm })).toBe(0);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(commands()).toHaveLength(1);
    expect(commands()[0]).toMatch(/^doas pacman -S --needed --noconfirm nss /);
    expect(printed()).toMatch(/Paso 1\/3.*pacman[\s\S]*Paso 2\/3.*doas[\s\S]*Paso 3\/3[\s\S]*doas pacman -S/);
  });

  it('does nothing when declined', () => {
    expect(installSystemDeps({ confirm: () => false })).toBe(0);
    expect(h.spawnSync).not.toHaveBeenCalled();
  });

  it('--yes does not ask', () => {
    const confirm = vi.fn(() => false);
    installSystemDeps({ yes: true, confirm });
    expect(confirm).not.toHaveBeenCalled();
    expect(commands()[0]).toMatch(/^doas pacman/);
  });

  it('without an interactive terminal and without --yes it refuses instead of installing', () => {
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
    expect(installSystemDeps()).toBe(1);
    expect(h.spawnSync).not.toHaveBeenCalled();
  });

  it('returns the package manager exit code when the install fails', () => {
    h.spawnSync.mockReturnValueOnce({ status: 100 });
    expect(installSystemDeps({ yes: true })).toBe(100);
  });

  it('stops at the step that cannot be done: no privilege tool, or unknown package manager', () => {
    h.has = new Set(['dnf']);
    expect(installSystemDeps({ yes: true })).toBe(1);
    h.has = new Set(['zypper', 'sudo']);
    expect(installSystemDeps({ yes: true })).toBe(1);
    expect(h.spawnSync).not.toHaveBeenCalled();
  });

  it('is a no-op outside Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    expect(installSystemDeps({ yes: true })).toBe(0);
    expect(h.spawnSync).not.toHaveBeenCalled();
  });
});
