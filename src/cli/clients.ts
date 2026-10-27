import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { ROOT_DIR } from '../config.js';

export type ClientId = 'claude' | 'codex' | 'opencode';
export type ClientSpec = { id: ClientId; label: string; binary: string; setupCommand: string };

export const CLIENTS: ClientSpec[] = [
  { id: 'claude', label: 'Claude Code', binary: 'claude', setupCommand: 'utn-mcp-mendoza setup-claude' },
  { id: 'codex', label: 'Codex', binary: 'codex', setupCommand: 'utn-mcp-mendoza setup-codex' },
  { id: 'opencode', label: 'OpenCode', binary: 'opencode', setupCommand: 'utn-mcp-mendoza setup-opencode' }
];

export const SERVER_NAME = 'utn-mendoza';
const WRITES_DISABLED = 'UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED=false';

export type Runner = (command: string, args: string[], options?: { shell?: boolean; timeout?: number; stdio?: 'inherit' | 'pipe' }) => Pick<SpawnSyncReturns<string>, 'status' | 'stdout' | 'error'>;

const defaultRunner: Runner = (command, args, options = {}) =>
  spawnSync(command, args, { encoding: 'utf8', shell: options.shell, timeout: options.timeout, stdio: options.stdio === 'inherit' ? 'inherit' : 'pipe' });

export function spec(id: ClientId): ClientSpec {
  const found = CLIENTS.find(client => client.id === id);
  if (!found) throw new Error(`Cliente desconocido: ${id}`);
  return found;
}

/** Argumentos con los que cada cliente registra el servidor (siempre con las entregas deshabilitadas). */
export function registrationArgs(id: ClientId): string[] {
  const entry = `${ROOT_DIR.replace(/\\/g, '/')}/dist/index.js`;
  switch (id) {
    case 'claude':
      return ['mcp', 'add', SERVER_NAME, '--scope', 'user', '--env', WRITES_DISABLED, '--', 'node', entry];
    case 'codex':
      return ['mcp', 'add', SERVER_NAME, '--env', WRITES_DISABLED, '--', 'node', entry];
    case 'opencode':
      return ['mcp', 'add', '--global', '--env', WRITES_DISABLED, SERVER_NAME, '--', 'node', entry];
  }
}

export function commandLine(binary: string, args: string[]): string {
  const quoted = args.map(arg => /[\s"]/.test(arg) ? `"${arg}"` : arg);
  return `${binary} ${quoted.join(' ')}`;
}

/** ¿Está el ejecutable del cliente en el PATH? */
export function isInstalled(binary: string, run: Runner = defaultRunner): boolean {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = run(finder, [binary], { timeout: 5000 });
  return !result.error && result.status === 0;
}

/** true/false si se pudo consultar la lista de servidores del cliente; undefined si no se pudo saber. */
export function isRegistered(binary: string, run: Runner = defaultRunner): boolean | undefined {
  const result = run(binary, ['mcp', 'list'], { timeout: 10000, shell: process.platform === 'win32' });
  if (result.error || result.status !== 0) return undefined;
  return new RegExp(`(^|[^a-z0-9-])${SERVER_NAME}([^a-z0-9-]|$)`, 'im').test(String(result.stdout ?? ''));
}

export type RegisterResult = { ok: boolean; line: string; message?: string };

/** Registra el servidor en el cliente. Con `printOnly` solo devuelve el comando. */
export function registerClient(id: ClientId, options: { printOnly?: boolean; run?: Runner } = {}): RegisterResult {
  const client = spec(id);
  const args = registrationArgs(id);
  const line = commandLine(client.binary, args);
  if (options.printOnly) return { ok: true, line };
  const windows = process.platform === 'win32';
  const run = options.run ?? defaultRunner;
  const quotedArgs = args.map(arg => /[\s"]/.test(arg) ? `"${arg}"` : arg);
  const result = windows
    ? run(`${client.binary} ${quotedArgs.join(' ')}`, [], { shell: true, stdio: 'inherit' })
    : run(client.binary, args, { stdio: 'inherit' });
  if (result.error) return { ok: false, line, message: `No se pudo ejecutar "${client.binary}". Instalalo o ejecutá a mano: ${line}` };
  if (result.status !== 0) return { ok: false, line, message: `${client.label} no pudo registrar el servidor (¿ya estaba registrado?). Revisá con: ${client.binary} mcp list` };
  return { ok: true, line };
}
