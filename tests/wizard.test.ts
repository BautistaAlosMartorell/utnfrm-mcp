import { describe, expect, it, vi } from 'vitest';
import { CLIENTS } from '../src/cli/clients.js';
import type { DoctorCheck } from '../src/cli/doctor.js';
import { runWizard, type WizardDeps, type WizardIO } from '../src/cli/wizard.js';

const ok = (id: DoctorCheck['id'], title = id): DoctorCheck => ({ id, title, status: 'ok', detail: 'ok' });
const skip = (id: DoctorCheck['id']): DoctorCheck => ({ id, title: id, status: 'skip', detail: 'no instalado' });

function harness(options: { ephemeral?: boolean; pickAnswer?: number[] | undefined; hasProfile?: boolean; answers?: boolean[]; typed?: string[]; checks?: (opts?: { machineOnly?: boolean; offline?: boolean }) => DoctorCheck[]; deps?: Partial<WizardDeps> } = {}) {
  const output: string[] = [];
  const questions: string[] = [];
  const answers = [...(options.answers ?? [])];
  const picks: Array<{ question: string; items: string[] }> = [];
  const pickAnswer = options.pickAnswer;
  const typed = [...(options.typed ?? [])];
  const prompts: Array<{ question: string; secret: boolean }> = [];
  const io: WizardIO = {
    say: message => { output.push(message ?? ''); },
    confirm: async (question, defaultYes) => { questions.push(question); return answers.length ? answers.shift()! : defaultYes; },
    pick: async (question, items) => { picks.push({ question, items }); return pickAnswer; },
    prompt: async (question, promptOptions) => { prompts.push({ question, secret: Boolean(promptOptions?.secret) }); return typed.shift() ?? ''; }
  };
  const healthy = (opts?: { machineOnly?: boolean; offline?: boolean }): DoctorCheck[] => opts?.machineOnly
    ? [ok('node'), ok('browser'), ok('storage'), ok('display')]
    : [ok('node'), ok('browser'), ok('storage'), ok('session'), ok('client-claude'), skip('client-codex'), skip('client-opencode')];
  const deps: WizardDeps = {
    diagnose: vi.fn(async opts => (options.checks ?? healthy)(opts)),
    installBrowser: vi.fn(() => 0),
    login: vi.fn(async () => true),
    getCredentials: vi.fn(async () => ({ username: '12345678', password: 'fixture', email: 'yo@alumnos.example' })),
    saveCredentials: vi.fn(async () => undefined),
    register: vi.fn(() => ({ ok: true, line: 'claude mcp add …' })),
    listCourses: vi.fn(async () => [{ id: '1', name: 'Ciencia de Datos', url: 'u' }, { id: '2', name: 'Inteligencia Artificial', url: 'u' }]),
    isEphemeralInstall: vi.fn(() => options.ephemeral ?? false),
    hasActiveProfile: vi.fn(() => options.hasProfile ?? false),
    saveActiveCourses: vi.fn(),
    clients: CLIENTS,
    ...options.deps
  };
  return { io, deps, output, questions, picks, prompts, text: () => output.join('\n') };
}

describe('setup wizard', () => {
  it('walks the happy path of an already configured machine without logging in again', async () => {
    const h = harness({ answers: [false] });
    const result = await runWizard({}, h.io, h.deps);
    expect(result).toMatchObject({ ok: true, pending: [] });
    expect(h.deps.login).not.toHaveBeenCalled();
    expect(h.deps.installBrowser).not.toHaveBeenCalled();
    expect(h.deps.register).not.toHaveBeenCalled(); // Claude Code ya estaba conectado
    expect(h.text()).toMatch(/Paso 1 de 6.*Paso 2 de 6.*Paso 3 de 6.*Paso 4 de 6.*Paso 5 de 6.*Paso 6 de 6/s);
    expect(h.text()).toMatch(/encontré 2 materias \(por ejemplo: Ciencia de Datos, Inteligencia Artificial\)/);
    expect(h.text()).toMatch(/¿Qué tengo para entregar esta semana\?/);
    expect(h.text()).toMatch(/almacén seguro de tu equipo/);
    expect(h.deps.saveCredentials).not.toHaveBeenCalled(); // ya había credenciales: no se vuelven a pedir
    expect(h.prompts).toEqual([]);
  });

  it('installs a missing browser after asking, then continues', async () => {
    let installed = false;
    const h = harness({
      checks: opts => opts?.machineOnly
        ? [ok('node'), installed ? ok('browser') : { id: 'browser', title: 'Navegador', status: 'fail', detail: 'falta' }, ok('storage')]
        : [ok('session'), ok('client-claude')],
      deps: { installBrowser: vi.fn(() => { installed = true; return 0; }) }
    });
    const result = await runWizard({}, h.io, h.deps);
    expect(h.questions[0]).toMatch(/¿Lo instalo ahora\?/);
    expect(h.deps.installBrowser).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
  });

  it('stops with the exact command when the secure store is missing', async () => {
    const h = harness({
      checks: () => [ok('node'), ok('browser'), { id: 'storage', title: 'Almacén seguro de sesión', status: 'fail', detail: 'falta secret-tool', fix: 'En Ubuntu/Debian ejecutá: sudo apt-get install -y libsecret-tools gnome-keyring.' }]
    });
    const result = await runWizard({}, h.io, h.deps);
    expect(result.ok).toBe(false);
    expect(h.text()).toMatch(/sudo apt-get install -y libsecret-tools gnome-keyring/);
    expect(h.text()).toMatch(/volvé a ejecutar: utn-mcp-mendoza setup-wizard/);
    expect(h.deps.login).not.toHaveBeenCalled();
  });

  it('stops if the user declines the browser or the install fails', async () => {
    const missing = (opts?: { machineOnly?: boolean }): DoctorCheck[] => opts?.machineOnly
      ? [ok('node'), { id: 'browser', title: 'Navegador', status: 'fail', detail: 'falta' }, ok('storage')]
      : [];
    const declined = harness({ answers: [false], checks: missing });
    expect((await runWizard({}, declined.io, declined.deps)).ok).toBe(false);
    expect(declined.deps.installBrowser).not.toHaveBeenCalled();
    const failing = harness({ checks: missing, deps: { installBrowser: vi.fn(() => 1) } });
    const result = await runWizard({ yes: true }, failing.io, failing.deps);
    expect(result.ok).toBe(false);
    expect(failing.text()).toMatch(/--with-deps/);
  });

  it('logs in when there is no session and stops if the login is not completed', async () => {
    const noSession = (opts?: { machineOnly?: boolean }): DoctorCheck[] => opts?.machineOnly
      ? [ok('node'), ok('browser'), ok('storage')]
      : [{ id: 'session', title: 'Sesión', status: 'fail', detail: 'no' }];
    const good = harness({ checks: noSession });
    expect((await runWizard({}, good.io, good.deps)).completed).toContain('sesión');
    expect(good.deps.login).toHaveBeenCalledTimes(1);
    const bad = harness({ checks: noSession, deps: { login: vi.fn(async () => false) } });
    const result = await runWizard({}, bad.io, bad.deps);
    expect(result.ok).toBe(false);
    expect(bad.deps.listCourses).not.toHaveBeenCalled();
  });

  it('offers to connect each detected client and records the ones left pending', async () => {
    const checks = (opts?: { machineOnly?: boolean }): DoctorCheck[] => opts?.machineOnly
      ? [ok('node'), ok('browser'), ok('storage')]
      : [ok('session'), { id: 'client-claude', title: 'Claude Code', status: 'warn', detail: 'sin conectar' }, { id: 'client-codex', title: 'Codex', status: 'warn', detail: 'sin conectar' }, skip('client-opencode')];
    const h = harness({ checks, answers: [false, true, false] });
    const result = await runWizard({}, h.io, h.deps);
    expect(h.deps.register).toHaveBeenCalledTimes(1);
    expect(h.deps.register).toHaveBeenCalledWith('claude');
    expect(result.pending).toEqual(['Codex']);
    expect(h.text()).toMatch(/Podés hacerlo después con: utn-mcp-mendoza setup-codex/);
    expect(result.ok).toBe(true);
  });

  it('reports a failed registration without aborting', async () => {
    const checks = (opts?: { machineOnly?: boolean }): DoctorCheck[] => opts?.machineOnly
      ? [ok('node'), ok('browser'), ok('storage')]
      : [ok('session'), { id: 'client-claude', title: 'Claude Code', status: 'warn', detail: 'sin conectar' }, skip('client-codex'), skip('client-opencode')];
    const h = harness({ checks, deps: { register: vi.fn(() => ({ ok: false, line: 'x', message: 'ya estaba registrado' })) } });
    const result = await runWizard({ yes: true }, h.io, h.deps);
    expect(h.text()).toMatch(/⚠ ya estaba registrado/);
    expect(result.pending).toEqual(['Claude Code']);
    expect(result.completed).toContain('prueba');
  });

  it('explains what to do when no client is installed', async () => {
    const checks = (opts?: { machineOnly?: boolean }): DoctorCheck[] => opts?.machineOnly
      ? [ok('node'), ok('browser'), ok('storage')]
      : [ok('session'), skip('client-claude'), skip('client-codex'), skip('client-opencode')];
    const h = harness({ checks });
    await runWizard({}, h.io, h.deps);
    expect(h.text()).toMatch(/utn-mcp-mendoza setup/);
    expect(h.deps.register).not.toHaveBeenCalled();
  });

  it('does not fail the install when only the final course check fails, but says so', async () => {
    const h = harness({ deps: { listCourses: vi.fn(async () => { throw new Error('red'); }) } });
    const result = await runWizard({ yes: true }, h.io, h.deps);
    expect(result.ok).toBe(false);
    expect(result.pending).toContain('prueba');
    expect(h.text()).toMatch(/utn-mcp-mendoza doctor/);
  });

  it('honours --yes, --no-login and --no-register without asking anything', async () => {
    const h = harness();
    const result = await runWizard({ yes: true, skipLogin: true, skipRegister: true }, h.io, h.deps);
    expect(h.questions).toEqual([]);
    expect(h.deps.login).not.toHaveBeenCalled();
    expect(h.deps.register).not.toHaveBeenCalled();
    expect(h.deps.listCourses).not.toHaveBeenCalled();
    expect(result.pending).toEqual(['login', 'clientes']);
  });

  it('lets the user pick the semester courses and saves only those', async () => {
    const h = harness({ answers: [false], pickAnswer: [1] });
    const result = await runWizard({}, h.io, h.deps);
    expect(h.picks[0].items).toEqual(['Ciencia de Datos', 'Inteligencia Artificial']);
    expect(h.deps.saveActiveCourses).toHaveBeenCalledWith(['2']);
    expect(result.completed).toContain('materias');
    expect(h.text()).toMatch(/Guardé 1 materia/);
  });

  it('keeps every course when the user accepts "todas", already has a profile, or runs with --yes', async () => {
    const all = harness({ answers: [false], pickAnswer: undefined });
    await runWizard({}, all.io, all.deps);
    expect(all.deps.saveActiveCourses).not.toHaveBeenCalled();
    expect(all.text()).toMatch(/Quedan todas tus materias/);

    const existing = harness({ answers: [false], hasProfile: true, pickAnswer: [0] });
    await runWizard({}, existing.io, existing.deps);
    expect(existing.picks).toHaveLength(0);

    const auto = harness({ pickAnswer: [0] });
    await runWizard({ yes: true }, auto.io, auto.deps);
    expect(auto.picks).toHaveLength(0);
  });

  it('ignores out-of-range picks', async () => {
    const h = harness({ answers: [false], pickAnswer: [7, -1] });
    await runWizard({}, h.io, h.deps);
    expect(h.deps.saveActiveCourses).not.toHaveBeenCalled();
  });

  it('refuses to connect clients from a temporary npx copy', async () => {
    const checks = (opts?: { machineOnly?: boolean }): DoctorCheck[] => opts?.machineOnly
      ? [ok('node'), ok('browser'), ok('storage')]
      : [ok('session'), { id: 'client-claude', title: 'Claude Code', status: 'warn', detail: 'sin conectar' }, skip('client-codex'), skip('client-opencode')];
    const h = harness({ checks, ephemeral: true });
    const result = await runWizard({ yes: true }, h.io, h.deps);
    expect(h.deps.register).not.toHaveBeenCalled();
    expect(h.text()).toMatch(/copia temporal \(npx\)/);
    expect(h.text()).toMatch(/npm install --global/);
    expect(result.pending).toContain('clientes');
  });

  it('asks for the DNI and a hidden password when none are saved, and stores them', async () => {
    const h = harness({ typed: [' 12345678 ', 's3cr3t', 'alumno@alumnos.example'], deps: { getCredentials: vi.fn(async () => null) } });
    const result = await runWizard({}, h.io, h.deps);
    expect(h.prompts.map(prompt => [prompt.question.split(' (')[0], prompt.secret])).toEqual([['Usuario', false], ['Contraseña', true], ['Correo institucional', false]]);
    expect(h.deps.saveCredentials).toHaveBeenCalledWith({ username: '12345678', password: 's3cr3t', email: 'alumno@alumnos.example' });
    expect(result.completed).toContain('credenciales');
    expect(h.text()).not.toContain('s3cr3t');
  });

  it('keeps going and records it as pending when the user declines to save credentials', async () => {
    const h = harness({ answers: [false], deps: { getCredentials: vi.fn(async () => null) } });
    const result = await runWizard({}, h.io, h.deps);
    expect(h.prompts).toEqual([]);
    expect(h.deps.saveCredentials).not.toHaveBeenCalled();
    expect(result.pending).toContain('credenciales');
    expect(result.ok).toBe(true);
  });

  it('never prompts for credentials with --yes', async () => {
    const h = harness({ deps: { getCredentials: vi.fn(async () => null) } });
    const result = await runWizard({ yes: true }, h.io, h.deps);
    expect(h.prompts).toEqual([]);
    expect(result.pending).toContain('credenciales');
  });

  it('saves nothing when the username or password comes back empty', async () => {
    const h = harness({ typed: ['12345678', ''], deps: { getCredentials: vi.fn(async () => null) } });
    const result = await runWizard({}, h.io, h.deps);
    expect(h.deps.saveCredentials).not.toHaveBeenCalled();
    expect(result.pending).toContain('credenciales');
    expect(h.text()).toMatch(/obligatorios/);
  });

  it('reports a failing secure store instead of pretending the credentials were saved', async () => {
    const unreadable = harness({ deps: { getCredentials: vi.fn(async () => { throw new Error('No esta disponible el almacen seguro'); }) } });
    expect((await runWizard({}, unreadable.io, unreadable.deps)).pending).toContain('credenciales');
    expect(unreadable.text()).toMatch(/almacen seguro/);

    const unsaved = harness({ typed: ['1', '2'], deps: { getCredentials: vi.fn(async () => null), saveCredentials: vi.fn(async () => { throw new Error('boom'); }) } });
    const result = await runWizard({}, unsaved.io, unsaved.deps);
    expect(result.completed).not.toContain('credenciales');
    expect(result.pending).toContain('credenciales');
  });

  it('saves without the mail and flags it pending when the institutional email is skipped or malformed', async () => {
    const skipped = harness({ typed: ['1', '2', ''], deps: { getCredentials: vi.fn(async () => null) } });
    const first = await runWizard({}, skipped.io, skipped.deps);
    expect(skipped.deps.saveCredentials).toHaveBeenCalledWith({ username: '1', password: '2' });
    expect(first.pending).toContain('correo');

    const malformed = harness({ typed: ['1', '2', 'no-es-un-correo'], deps: { getCredentials: vi.fn(async () => null) } });
    await runWizard({}, malformed.io, malformed.deps);
    expect(malformed.deps.saveCredentials).toHaveBeenCalledWith({ username: '1', password: '2' });
    expect(malformed.text()).toMatch(/no parece válido/);
  });

  it('asks only for the email when credentials were saved before the mail existed', async () => {
    const h = harness({ typed: ['yo@alumnos.frm.utn.edu.ar'], deps: { getCredentials: vi.fn(async () => ({ username: '1', password: '2' })) } });
    const result = await runWizard({}, h.io, h.deps);
    expect(h.prompts).toHaveLength(1);
    expect(h.deps.saveCredentials).toHaveBeenCalledWith({ username: '1', password: '2', email: 'yo@alumnos.frm.utn.edu.ar' });
    expect(result.pending).not.toContain('correo');
  });
});
