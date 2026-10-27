import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeSessionAge, getSessionStatus, resetBackgroundTasks, startBrowserInstall, startLogin, type SessionToolDeps
} from '../src/session/session-status.js';

const NOW = new Date('2026-10-26T20:00:00-03:00');
const hoursAgo = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000);

function deps(overrides: Partial<SessionToolDeps> = {}): SessionToolDeps {
  return {
    login: vi.fn(async () => ({ ok: true, message: 'Sesión guardada.' })),
    install: vi.fn(async () => ({ status: 0, stderr: '' })),
    validate: vi.fn(async () => ({ valid: true })),
    savedAt: () => hoursAgo(2),
    exists: () => true,
    browserInstalled: () => true,
    now: () => NOW,
    ...overrides
  };
}
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => resetBackgroundTasks());

describe('session age', () => {
  it('describes fresh, aging and missing sessions', () => {
    expect(describeSessionAge(undefined, NOW)).toMatchObject({ level: 'none' });
    expect(describeSessionAge(hoursAgo(0.2), NOW)).toMatchObject({ level: 'fresh', text: 'guardada hace menos de 1 hora' });
    expect(describeSessionAge(hoursAgo(3), NOW)).toMatchObject({ level: 'fresh', text: 'guardada hace 3 h', ageHours: 3 });
    const aging = describeSessionAge(hoursAgo(7), NOW);
    expect(aging.level).toBe('aging');
    expect(aging.text).toMatch(/vencer a las ~8 h/);
  });
});

describe('session_status', () => {
  it('reports an active session and says everything is ready', async () => {
    const status = await getSessionStatus(deps());
    expect(status).toMatchObject({ active: true, hasSavedSession: true, browserInstalled: true, loginInProgress: false });
    expect(status.nextStep).toMatch(/Todo listo/);
  });

  it('guides the user through each possible state', async () => {
    expect((await getSessionStatus(deps({ browserInstalled: () => false }))).nextStep).toMatch(/install_browser/);
    expect((await getSessionStatus(deps({ exists: () => false }))).nextStep).toMatch(/start_login/);
    expect((await getSessionStatus(deps({ validate: async () => ({ valid: false }) }))).nextStep).toMatch(/venció.*start_login/);
    expect((await getSessionStatus(deps({ savedAt: () => hoursAgo(7) }))).nextStep).toMatch(/por vencer/);
    expect((await getSessionStatus(deps({ validate: async () => { throw new Error('red'); } }))).active).toBe(false);
  });

  it('does not call the Campus when there is no saved session', async () => {
    const d = deps({ exists: () => false });
    await getSessionStatus(d);
    expect(d.validate).not.toHaveBeenCalled();
  });
});

describe('start_login', () => {
  it('returns immediately, tracks progress and never starts two windows', async () => {
    let finish!: (value: { ok: boolean; message: string }) => void;
    const d = deps({ login: vi.fn(() => new Promise(resolve => { finish = resolve; })) });
    const first = startLogin(d);
    expect(first.started).toBe(true);
    expect(first.message).toMatch(/session_status/);
    expect(startLogin(d)).toMatchObject({ started: false, message: expect.stringMatching(/Ya hay una ventana/) });
    expect(d.login).toHaveBeenCalledTimes(1);
    expect((await getSessionStatus(d)).nextStep).toMatch(/ventana del navegador abierta/);

    finish({ ok: true, message: 'Sesión guardada.' });
    await flush();
    expect((await getSessionStatus(d)).login.status).toBe('done');
    expect(startLogin(d).started).toBe(true); // se puede volver a abrir para renovar
  });

  it('records a failure without leaking sensitive text and refuses without a browser', async () => {
    const failing = deps({ login: vi.fn(async () => ({ ok: false, message: 'falló con MoodleSession=secreto en https://campusvirtual.frm.utn.edu.ar/x' })) });
    startLogin(failing);
    await flush();
    const status = await getSessionStatus(failing);
    expect(status.login.status).toBe('failed');
    expect(JSON.stringify(status)).not.toMatch(/secreto|campusvirtual/);
    resetBackgroundTasks();
    expect(startLogin(deps({ browserInstalled: () => false }))).toMatchObject({ started: false, message: expect.stringMatching(/install_browser/) });
  });

  it('survives a login that throws', async () => {
    const d = deps({ login: vi.fn(async () => { throw new Error('boom'); }) });
    startLogin(d);
    await flush();
    expect((await getSessionStatus(d)).login).toMatchObject({ status: 'failed', message: 'boom' });
  });
});

describe('install_browser', () => {
  it('installs in the background and reports success or failure', async () => {
    const d = deps({ browserInstalled: () => false });
    expect(startBrowserInstall(d).started).toBe(true);
    expect(startBrowserInstall(d)).toMatchObject({ started: false });
    await flush();
    expect((await getSessionStatus(d)).browserInstall.status).toBe('done');

    resetBackgroundTasks();
    const bad = deps({ browserInstalled: () => false, install: vi.fn(async () => ({ status: 1, stderr: 'sin espacio en disco' })) });
    startBrowserInstall(bad);
    await flush();
    expect((await getSessionStatus(bad)).browserInstall).toMatchObject({ status: 'failed', message: 'sin espacio en disco' });
  });

  it('does nothing when the browser is already there', () => {
    expect(startBrowserInstall(deps())).toMatchObject({ started: false, message: expect.stringMatching(/ya está instalado/) });
  });
});
