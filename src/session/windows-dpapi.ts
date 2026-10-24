import { spawnSync } from 'node:child_process';

const ENVELOPE_PREFIX = 'UTN-MCP-DPAPI:v1:';
const MAX_STATE_BYTES = 4 * 1024 * 1024;
const MAX_ENCRYPTED_BYTES = 5 * 1024 * 1024;

type CommandResult = {
  status: number | null;
  stdout: string;
  error?: Error;
};

type CommandRunner = (
  command: string,
  args: string[],
  options: { encoding: 'utf8'; input: string; windowsHide: true; timeout: number; maxBuffer: number }
) => CommandResult;

const runCommand: CommandRunner = (command, args, options) => {
  const result = spawnSync(command, args, options);
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    error: result.error
  };
};

function invokeDpapi(operation: 'protect' | 'unprotect', input: Buffer, run: CommandRunner): Buffer {
  if (process.platform !== 'win32' && run === runCommand) throw new Error('DPAPI solo está disponible en Windows.');
  const inputLimit = operation === 'protect' ? MAX_STATE_BYTES : MAX_ENCRYPTED_BYTES;
  if (input.byteLength > inputLimit) throw new Error('El estado local supera el límite de 4 MiB.');

  const expression = operation === 'protect'
    ? '[Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)'
    : '[Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)';
  const script = [
    '$ErrorActionPreference = "Stop"',
    'Add-Type -AssemblyName System.Security',
    '$encoded = [Console]::In.ReadToEnd()',
    '$bytes = [Convert]::FromBase64String($encoded)',
    `$result = ${expression}`,
    '[Console]::Out.Write([Convert]::ToBase64String($result))'
  ].join('; ');
  const result = run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    input: input.toString('base64'),
    windowsHide: true,
    timeout: 15000,
    maxBuffer: MAX_ENCRYPTED_BYTES * 2
  });

  const output = result.stdout.trim();
  if (result.error || result.status !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(output)) {
    throw new Error(operation === 'protect'
      ? 'No se pudo cifrar el estado local con DPAPI.'
      : 'No se pudo descifrar el estado local con DPAPI para esta cuenta de Windows.');
  }
  const decoded = Buffer.from(output, 'base64');
  const outputLimit = operation === 'protect' ? MAX_ENCRYPTED_BYTES : MAX_STATE_BYTES;
  if (decoded.byteLength > outputLimit) throw new Error('El estado local supera el límite de 4 MiB.');
  return decoded;
}

/** Encrypts session JSON with Windows DPAPI scoped to the current user. */
export function protectWindowsSessionData(json: string, run: CommandRunner = runCommand): string {
  const encrypted = invokeDpapi('protect', Buffer.from(json, 'utf8'), run);
  return ENVELOPE_PREFIX + encrypted.toString('base64');
}

/** Decrypts a versioned DPAPI envelope without exposing payloads in process arguments or logs. */
export function unprotectWindowsSessionData(envelope: string, run: CommandRunner = runCommand): string {
  if (envelope.length > 7 * 1024 * 1024) throw new Error('El estado local supera el límite de 4 MiB.');
  if (!envelope.startsWith(ENVELOPE_PREFIX)) {
    throw new Error('El archivo de sesión cifrada tiene un formato desconocido.');
  }
  const payload = envelope.slice(ENVELOPE_PREFIX.length);
  if (!payload || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)) {
    throw new Error('El archivo de sesión cifrada está dañado.');
  }
  const plaintext = invokeDpapi('unprotect', Buffer.from(payload, 'base64'), run);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(plaintext);
  } catch {
    throw new Error('El estado local descifrado no es texto UTF-8 válido.');
  }
}
