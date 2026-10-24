import { spawnSync } from 'node:child_process';

type CommandResult = {
  status: number | null;
  stdout: string;
  error?: Error;
};

type CommandRunner = (
  command: string,
  args: string[],
  options: { encoding: 'utf8'; windowsHide: true }
) => CommandResult;

const runCommand: CommandRunner = (command, args, options) => {
  const result = spawnSync(command, args, options);
  return {
    status: result.status,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    error: result.error
  };
};

/** Restrict a Windows session path to its current user and Local System. */
export function protectWindowsSessionPath(
  targetPath: string,
  isDirectory: boolean,
  run: CommandRunner = runCommand
): void {
  const identity = run('whoami.exe', ['/user', '/fo', 'csv', '/nh'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (identity.error || identity.status !== 0) {
    throw new Error('No se pudo determinar la cuenta actual para proteger la sesión local.');
  }

  const userSid = identity.stdout.match(/\bS-1-(?:\d+-){1,14}\d+\b/)?.[0];
  if (!userSid) {
    throw new Error('No se pudo determinar el identificador de la cuenta actual para proteger la sesión local.');
  }

  const inheritanceFlags = isDirectory ? '(OI)(CI)' : '';
  const result = run('icacls.exe', [
    targetPath,
    '/inheritance:r',
    '/grant:r',
    `*${userSid}:${inheritanceFlags}F`,
    `*S-1-5-18:${inheritanceFlags}F`
  ], {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    throw new Error('No se pudieron restringir los permisos de la sesión local en Windows.');
  }
}
