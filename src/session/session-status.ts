import { installChromiumAsync } from '../cli/install-browser.js';
import { campusClient } from '../client/campus-client.js';
import { sanitizeCampusErrorMessage } from '../client/error-sanitizer.js';
import { loginInBackground } from './auth.js';
import { SessionStore } from './session-store.js';
import { checkServiceLogin, defaultServiceLoginDeps, type ServiceLogin, type ServiceLoginDeps } from './service-logins.js';
import { browserInstalled } from './browser.js';

/** Moodle vence las sesiones tras unas horas de uso; se avisa antes de que ocurra. */
export const SESSION_TYPICAL_HOURS = 8;
export const SESSION_WARN_AFTER_HOURS = 6;

export type SessionAge = { savedAt?: string; ageHours?: number; level: 'none' | 'fresh' | 'aging'; text: string };

export function describeSessionAge(savedAt: Date | undefined, now: Date = new Date()): SessionAge {
  if (!savedAt) return { level: 'none', text: 'no hay una sesión guardada' };
  const hours = Math.max(0, (now.getTime() - savedAt.getTime()) / 3_600_000);
  const rounded = Math.round(hours * 10) / 10;
  const readable = hours < 1 ? 'hace menos de 1 hora' : `hace ${Math.floor(hours)} h`;
  if (hours >= SESSION_WARN_AFTER_HOURS) {
    return { savedAt: savedAt.toISOString(), ageHours: rounded, level: 'aging', text: `guardada ${readable}; las sesiones del Campus suelen vencer a las ~${SESSION_TYPICAL_HOURS} h, conviene renovarla` };
  }
  return { savedAt: savedAt.toISOString(), ageHours: rounded, level: 'fresh', text: `guardada ${readable}` };
}

type TaskState = { status: 'idle' | 'running' | 'done' | 'failed'; startedAt?: string; message?: string };
let loginTask: TaskState = { status: 'idle' };
let installTask: TaskState = { status: 'idle' };

export function resetBackgroundTasks(): void {
  loginTask = { status: 'idle' };
  installTask = { status: 'idle' };
}

export interface SessionToolDeps {
  login: () => Promise<{ ok: boolean; message: string }>;
  install: () => Promise<{ status: number; stderr: string }>;
  validate: () => Promise<{ valid: boolean }>;
  savedAt: () => Date | undefined;
  exists: () => boolean;
  browserInstalled: () => boolean;
  serviceLogins: ServiceLoginDeps;
  now: () => Date;
}

const defaultDeps: SessionToolDeps = {
  login: () => loginInBackground(),
  install: () => installChromiumAsync(),
  validate: () => campusClient.validateSession(),
  savedAt: () => SessionStore.savedAt(),
  exists: () => { try { return SessionStore.exists(); } catch { return false; } },
  browserInstalled,
  serviceLogins: defaultServiceLoginDeps,
  now: () => new Date()
};

export interface SessionStatusResult {
  active: boolean;
  hasSavedSession: boolean;
  session: SessionAge;
  browserInstalled: boolean;
  loginInProgress: boolean;
  login: TaskState;
  browserInstall: TaskState;
  /** Correo y Autogestión usan las credenciales guardadas; el Campus se ve en `active`. */
  services: { correo: ServiceLogin; autogestion: ServiceLogin };
  nextStep: string;
}

/** Estado de la sesión y del navegador, con el próximo paso en lenguaje claro (pensado para quien no usa terminal). */
export async function getSessionStatus(deps: SessionToolDeps = defaultDeps): Promise<SessionStatusResult> {
  const hasSavedSession = deps.exists();
  let active = false;
  if (hasSavedSession) {
    try { active = (await deps.validate()).valid; } catch { active = false; }
  }
  const age = describeSessionAge(hasSavedSession ? deps.savedAt() : undefined, deps.now());
  const installed = deps.browserInstalled();

  let nextStep: string;
  if (installTask.status === 'running') nextStep = 'Se está instalando el navegador; esperá unos minutos y volvé a consultar el estado.';
  else if (loginTask.status === 'running') nextStep = 'Hay una ventana del navegador abierta en el Campus: iniciá sesión ahí y volvé a consultar el estado.';
  else if (!installed) nextStep = 'Falta el navegador que se usa para iniciar sesión: usá install_browser.';
  else if (!hasSavedSession) nextStep = 'Todavía no iniciaste sesión: usá start_login.';
  else if (!active) nextStep = 'La sesión venció: usá start_login para renovarla.';
  else if (age.level === 'aging') nextStep = 'La sesión funciona pero está por vencer: conviene renovarla con start_login.';
  else nextStep = 'Todo listo: la sesión está activa.';

  const services = {
    correo: await checkServiceLogin('correo', deps.serviceLogins, { verify: true, browser: false }),
    autogestion: await checkServiceLogin('autogestion', deps.serviceLogins, { verify: true, browser: false })
  };

  return {
    active,
    hasSavedSession,
    session: age,
    browserInstalled: installed,
    loginInProgress: loginTask.status === 'running',
    login: loginTask,
    browserInstall: installTask,
    services,
    nextStep
  };
}

/**
 * Abre la ventana de inicio de sesión del Campus y vuelve enseguida (la persona ingresa sus datos en el
 * navegador; el MCP nunca los ve). El resultado se consulta con session_status.
 */
export function startLogin(deps: SessionToolDeps = defaultDeps): { started: boolean; message: string } {
  if (loginTask.status === 'running') return { started: false, message: 'Ya hay una ventana de inicio de sesión abierta: completá el ingreso ahí.' };
  if (!deps.browserInstalled()) return { started: false, message: 'Falta el navegador que se usa para iniciar sesión: ejecutá install_browser primero.' };
  loginTask = { status: 'running', startedAt: deps.now().toISOString() };
  void deps.login().then(
    result => { loginTask = { ...loginTask, status: result.ok ? 'done' : 'failed', message: sanitizeCampusErrorMessage(result.message) }; },
    error => { loginTask = { ...loginTask, status: 'failed', message: sanitizeCampusErrorMessage(error instanceof Error ? error.message : 'Error desconocido') }; }
  );
  return { started: true, message: 'Se abrió el navegador con el Campus, Autogestión y el Webmail en tres pestañas. Iniciá sesión en cada una y elegí tu legajo en Autogestión (tenés unos 5 minutos); después consultá session_status.' };
}

/** Descarga el navegador que usa el MCP (unos 150 MB). Corre en segundo plano; el avance se ve en session_status. */
export function startBrowserInstall(deps: SessionToolDeps = defaultDeps): { started: boolean; message: string } {
  if (deps.browserInstalled()) return { started: false, message: 'El navegador ya está instalado.' };
  if (installTask.status === 'running') return { started: false, message: 'La instalación del navegador ya está en curso.' };
  installTask = { status: 'running', startedAt: deps.now().toISOString() };
  void deps.install().then(
    result => { installTask = { ...installTask, status: result.status === 0 ? 'done' : 'failed', message: result.status === 0 ? undefined : sanitizeCampusErrorMessage(result.stderr || 'La instalación falló.') }; },
    error => { installTask = { ...installTask, status: 'failed', message: sanitizeCampusErrorMessage(error instanceof Error ? error.message : 'Error desconocido') }; }
  );
  return { started: true, message: 'Se empezó a instalar el navegador (unos 150 MB). Consultá session_status en unos minutos.' };
}
