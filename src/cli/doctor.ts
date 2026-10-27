import fs from 'node:fs';
import { chromium } from 'playwright';
import { secrets } from 'just-secrets';
import { campusClient } from '../client/campus-client.js';
import { SessionStore } from '../session/session-store.js';
import { CLIENTS, isInstalled, isRegistered, type ClientSpec } from './clients.js';
import { describeCliError } from '../client/friendly-errors.js';
import { describeSessionAge } from '../session/session-status.js';

export type CheckStatus = 'ok' | 'warn' | 'fail' | 'skip';
export type DoctorCheck = {
  id: 'node' | 'browser' | 'storage' | 'display' | 'session' | `client-${string}`;
  title: string;
  status: CheckStatus;
  detail: string;
  /** Acción concreta para resolverlo, escrita para alguien no técnico. */
  fix?: string;
};

export interface DoctorDeps {
  platform: NodeJS.Platform;
  nodeVersion: string;
  env: NodeJS.ProcessEnv;
  chromiumPath: () => string | undefined;
  fileExists: (path: string) => boolean;
  hasCommand: (command: string) => boolean;
  probeSecretStorage: () => Promise<void>;
  sessionExists: () => boolean;
  sessionSavedAt: () => Date | undefined;
  validateSession: () => Promise<{ valid: boolean; userName?: string; error?: string }>;
  clients: ClientSpec[];
  clientInstalled: (binary: string) => boolean;
  clientRegistered: (binary: string) => boolean | undefined;
}

export const defaultDoctorDeps: DoctorDeps = {
  platform: process.platform,
  nodeVersion: process.versions.node,
  env: process.env,
  chromiumPath: () => {
    try { return chromium.executablePath(); } catch { return undefined; }
  },
  fileExists: path => fs.existsSync(path),
  hasCommand: command => isInstalled(command),
  // Lectura inocua de una clave que no existe: confirma que el almacén responde sin escribir nada.
  probeSecretStorage: async () => {
    await secrets.get({ service: 'ar.edu.utn.frm.mcp', name: 'doctor-probe' });
  },
  sessionExists: () => SessionStore.exists(),
  sessionSavedAt: () => SessionStore.savedAt(),
  validateSession: () => campusClient.validateSession(),
  clients: CLIENTS,
  clientInstalled: binary => isInstalled(binary),
  clientRegistered: binary => isRegistered(binary)
};

const MIN_NODE = [22, 13, 0];

function nodeAtLeast(version: string): boolean {
  const parts = version.split('.').map(part => Number.parseInt(part, 10) || 0);
  for (let i = 0; i < MIN_NODE.length; i += 1) {
    if ((parts[i] ?? 0) > MIN_NODE[i]) return true;
    if ((parts[i] ?? 0) < MIN_NODE[i]) return false;
  }
  return true;
}

export type DoctorOptions = {
  /** No consulta al Campus (útil sin conexión o para no usar la sesión). */
  offline?: boolean;
  /** Solo revisa el equipo: omite sesión y clientes. */
  machineOnly?: boolean;
};

/**
 * Diagnóstico en una pantalla. Nunca imprime rutas, usuarios, cookies ni datos académicos: la salida se
 * puede pegar en un reporte tal cual.
 */
export async function runDoctor(options: DoctorOptions = {}, deps: DoctorDeps = defaultDoctorDeps): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  const nodeOk = nodeAtLeast(deps.nodeVersion);
  checks.push(nodeOk
    ? { id: 'node', title: 'Node.js', status: 'ok', detail: `versión ${deps.nodeVersion}` }
    : {
        id: 'node', title: 'Node.js', status: 'fail', detail: `versión ${deps.nodeVersion}; se necesita 22.13 o posterior`,
        fix: 'Instalá Node.js 22.13 o posterior desde https://nodejs.org, abrí una terminal nueva y volvé a intentar.'
      });

  const browser = deps.chromiumPath();
  checks.push(browser && deps.fileExists(browser)
    ? { id: 'browser', title: 'Navegador Chromium', status: 'ok', detail: 'instalado para esta versión del MCP' }
    : {
        id: 'browser', title: 'Navegador Chromium', status: 'fail', detail: 'falta, o es de otra versión',
        fix: 'Ejecutá: utn-mcp-mendoza install-browser'
      });

  if (deps.platform === 'win32') {
    checks.push({ id: 'storage', title: 'Almacén seguro de sesión', status: 'ok', detail: 'protección de Windows (DPAPI)' });
  } else if (deps.platform === 'linux' && !deps.hasCommand('secret-tool')) {
    checks.push({
      id: 'storage', title: 'Almacén seguro de sesión', status: 'fail', detail: 'falta secret-tool (paquete libsecret-tools)',
      fix: 'En Ubuntu/Debian ejecutá: sudo apt-get install -y libsecret-tools gnome-keyring. Después, usá una sesión de escritorio con el almacén desbloqueado.'
    });
  } else {
    try {
      await deps.probeSecretStorage();
      checks.push({
        id: 'storage', title: 'Almacén seguro de sesión', status: 'ok',
        detail: deps.platform === 'darwin' ? 'Llavero de macOS disponible' : 'Secret Service disponible'
      });
    } catch {
      checks.push({
        id: 'storage', title: 'Almacén seguro de sesión', status: 'fail', detail: 'no responde',
        fix: deps.platform === 'darwin'
          ? 'Desbloqueá el Llavero de inicio de sesión y permití el acceso cuando macOS lo pregunte.'
          : 'Iniciá una sesión de escritorio con el almacén de contraseñas desbloqueado (no sirve por SSH ni en modo sin pantalla).'
      });
    }
  }

  if (deps.platform === 'linux') {
    const hasDisplay = Boolean(deps.env.DISPLAY || deps.env.WAYLAND_DISPLAY);
    checks.push(hasDisplay
      ? { id: 'display', title: 'Pantalla para el inicio de sesión', status: 'ok', detail: 'entorno gráfico disponible' }
      : {
          id: 'display', title: 'Pantalla para el inicio de sesión', status: 'warn', detail: 'no se detectó entorno gráfico',
          fix: 'Para iniciar sesión necesitás abrir el navegador: ejecutá el comando desde una sesión de escritorio.'
        });
  }

  if (options.machineOnly) return checks;

  let hasSession = false;
  try {
    hasSession = deps.sessionExists();
  } catch (error) {
    checks.push({ id: 'session', title: 'Sesión del Campus', status: 'fail', detail: describeCliError(error), fix: 'Ejecutá: utn-mcp-mendoza logout y después utn-mcp-mendoza login' });
  }
  if (!checks.some(check => check.id === 'session')) {
    if (!hasSession) {
      checks.push({ id: 'session', title: 'Sesión del Campus', status: 'fail', detail: 'todavía no iniciaste sesión', fix: 'Ejecutá: utn-mcp-mendoza login' });
    } else if (options.offline) {
      checks.push({ id: 'session', title: 'Sesión del Campus', status: 'skip', detail: 'guardada; no se verificó contra el Campus (modo sin conexión)' });
    } else {
      const result = await deps.validateSession();
      const age = describeSessionAge(deps.sessionSavedAt());
      checks.push(result.valid
        ? {
            id: 'session', title: 'Sesión del Campus', status: age.level === 'aging' ? 'warn' : 'ok',
            detail: age.level === 'none' ? 'activa' : `activa (${age.text})`,
            fix: age.level === 'aging' ? 'Para no quedarte sin acceso en medio del estudio, ejecutá: utn-mcp-mendoza login' : undefined
          }
        : { id: 'session', title: 'Sesión del Campus', status: 'fail', detail: 'venció o no es válida', fix: 'Ejecutá: utn-mcp-mendoza login' });
    }
  }

  let anyInstalled = false;
  for (const client of deps.clients) {
    if (!deps.clientInstalled(client.binary)) {
      checks.push({ id: `client-${client.id}`, title: client.label, status: 'skip', detail: 'no está instalado en este equipo' });
      continue;
    }
    anyInstalled = true;
    const registered = deps.clientRegistered(client.binary);
    if (registered === true) checks.push({ id: `client-${client.id}`, title: client.label, status: 'ok', detail: 'conectado con el MCP' });
    else if (registered === false) {
      checks.push({ id: `client-${client.id}`, title: client.label, status: 'warn', detail: 'instalado, pero sin conectar', fix: `Ejecutá: ${client.setupCommand}` });
    } else {
      checks.push({ id: `client-${client.id}`, title: client.label, status: 'warn', detail: 'instalado; no se pudo comprobar si está conectado', fix: `Revisá con: ${client.binary} mcp list` });
    }
  }
  if (!anyInstalled) {
    checks.push({
      id: 'client-none', title: 'Cliente de IA', status: 'warn', detail: 'no se detectó Claude Code, Codex ni OpenCode',
      fix: 'Si usás Claude Desktop, Cursor o VS Code, ejecutá: utn-mcp-mendoza setup (muestra la configuración para pegar).'
    });
  }
  return checks;
}

const ICON: Record<CheckStatus, string> = { ok: '✔', warn: '⚠', fail: '✘', skip: '–' };

export function formatDoctor(checks: DoctorCheck[]): string {
  const lines = ['UTN MCP Mendoza — diagnóstico', ''];
  for (const check of checks) {
    lines.push(`${ICON[check.status]} ${check.title}: ${check.detail}`);
    if (check.fix && check.status !== 'ok') lines.push(`    → ${check.fix}`);
  }
  const failed = checks.filter(check => check.status === 'fail').length;
  const warned = checks.filter(check => check.status === 'warn').length;
  lines.push('');
  lines.push(failed > 0
    ? `Hay ${failed} ${failed === 1 ? 'cosa' : 'cosas'} para resolver antes de usarlo. Seguí las indicaciones con → y volvé a ejecutar: utn-mcp-mendoza doctor`
    : warned > 0
      ? 'Todo lo esencial funciona. Hay avisos opcionales arriba.'
      : 'Todo en orden.');
  return lines.join('\n');
}

export function doctorExitCode(checks: DoctorCheck[]): number {
  return checks.some(check => check.status === 'fail') ? 1 : 0;
}
