import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';
import { campusClient } from '../client/campus-client.js';
import { SessionStore } from '../session/session-store.js';

export type DoctorStatus = 'ok' | 'fail' | 'warn' | 'skip';

export interface DoctorCheck {
  name: string;
  status: DoctorStatus;
  detail: string;
  action?: string;
}

export type ClientState = 'missing' | 'registered' | 'unregistered';

/** Todo lo que toca el sistema va por acá para poder simularlo en los tests. */
export interface DoctorProbes {
  platform: NodeJS.Platform;
  nodeVersion: string;
  chromiumInstalled(): boolean;
  secretToolAvailable(): boolean;
  hasLocalSession(): boolean;
  sessionValid(): Promise<boolean>;
  clientState(binary: string): ClientState;
}

const MIN_NODE = [22, 13];
const CLIENTS = [
  { label: 'Codex', binary: 'codex', setup: 'setup-codex' },
  { label: 'Claude Code', binary: 'claude', setup: 'setup-claude' },
  { label: 'OpenCode', binary: 'opencode', setup: 'setup-opencode' }
];

function nodeIsSupported(version: string): boolean {
  const [major = 0, minor = 0] = version.split('.').map(Number);
  return major > MIN_NODE[0]! || (major === MIN_NODE[0] && minor >= MIN_NODE[1]!);
}

export async function runDoctor(probes: DoctorProbes): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  checks.push(nodeIsSupported(probes.nodeVersion)
    ? { name: 'Node.js', status: 'ok', detail: 'v' + probes.nodeVersion }
    : {
        name: 'Node.js', status: 'fail', detail: 'v' + probes.nodeVersion + ' (se necesita ' + MIN_NODE.join('.') + ' o posterior)',
        action: 'Instalá una versión reciente desde https://nodejs.org/ y abrí una terminal nueva.'
      });

  checks.push(probes.chromiumInstalled()
    ? { name: 'Chromium', status: 'ok', detail: 'instalado para esta versión' }
    : {
        name: 'Chromium', status: 'fail', detail: 'no encontrado para esta versión',
        action: 'Ejecutá: utn-mcp-mendoza install-browser'
      });

  if (probes.platform === 'linux') {
    checks.push(probes.secretToolAvailable()
      ? { name: 'Almacén de contraseñas', status: 'ok', detail: 'secret-tool disponible' }
      : {
          name: 'Almacén de contraseñas', status: 'fail', detail: 'falta secret-tool',
          action: 'Ejecutá: sudo apt-get install -y libsecret-tools gnome-keyring (Debian/Ubuntu) y usá una sesión de escritorio con el almacén desbloqueado.'
        });
  }

  if (!probes.hasLocalSession()) {
    checks.push({
      name: 'Sesión local', status: 'fail', detail: 'no hay sesión guardada',
      action: 'Ejecutá: utn-mcp-mendoza login'
    });
    checks.push({ name: 'Sesión en el Campus', status: 'skip', detail: 'requiere sesión local' });
  } else {
    checks.push({ name: 'Sesión local', status: 'ok', detail: 'guardada' });
    try {
      checks.push(await probes.sessionValid()
        ? { name: 'Sesión en el Campus', status: 'ok', detail: 'activa' }
        : {
            name: 'Sesión en el Campus', status: 'fail', detail: 'expirada o inválida',
            action: 'Ejecutá: utn-mcp-mendoza login'
          });
    } catch {
      checks.push({
        name: 'Sesión en el Campus', status: 'warn', detail: 'no se pudo comprobar',
        action: 'Revisá tu conexión y reintentá. Con UTN_MCP_DEBUG=1 se muestran más detalles.'
      });
    }
  }

  for (const client of CLIENTS) {
    const state = probes.clientState(client.binary);
    if (state === 'missing') {
      checks.push({ name: client.label, status: 'skip', detail: 'no detectado' });
    } else if (state === 'registered') {
      checks.push({ name: client.label, status: 'ok', detail: 'MCP registrado' });
    } else {
      checks.push({
        name: client.label, status: 'warn', detail: 'detectado, MCP sin registrar',
        action: 'Ejecutá: utn-mcp-mendoza ' + client.setup
      });
    }
  }

  return checks;
}

const LABELS: Record<DoctorStatus, string> = { ok: 'OK  ', fail: 'FALLA', warn: 'AVISO', skip: '-    ' };

export function formatDoctor(checks: DoctorCheck[]): string {
  const lines = ['Diagnóstico de UTN MCP Mendoza', ''];
  for (const check of checks) {
    lines.push('[' + LABELS[check.status] + '] ' + check.name + ': ' + check.detail);
    if (check.action) lines.push('        ' + check.action);
  }
  const failed = checks.filter(check => check.status === 'fail').length;
  lines.push('', failed ? failed + ' problema(s) para resolver.' : 'Todo en orden.');
  return lines.join('\n');
}

export function doctorExitCode(checks: DoctorCheck[]): number {
  return checks.some(check => check.status === 'fail') ? 1 : 0;
}

export const systemProbes: DoctorProbes = {
  platform: process.platform,
  nodeVersion: process.versions.node,
  chromiumInstalled: () => {
    try {
      return fs.existsSync(chromium.executablePath());
    } catch {
      return false;
    }
  },
  secretToolAvailable: () => !spawnSync('secret-tool', ['--help'], { stdio: 'ignore', timeout: 5000 }).error,
  hasLocalSession: () => {
    try { return SessionStore.exists(); } catch { return true; }
  },
  sessionValid: async () => (await campusClient.validateSession()).valid,
  clientState: binary => {
    // En Windows los clientes son .cmd y spawn exige shell.
    const result = spawnSync(binary, ['mcp', 'list'], {
      encoding: 'utf8', timeout: 10000, shell: process.platform === 'win32'
    });
    if (result.error || result.status !== 0) return 'missing';
    return /utn-mendoza/.test(result.stdout) ? 'registered' : 'unregistered';
  }
};
