import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Descarga el Chromium que corresponde a esta versión del MCP (sin permisos de administrador). Devuelve el código de salida. */
export function installChromium(): number {
  const playwrightEntry = fileURLToPath(import.meta.resolve('playwright'));
  const playwrightCli = path.join(path.dirname(playwrightEntry), 'cli.js');
  const result = spawnSync(process.execPath, [playwrightCli, 'install', 'chromium'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/**
 * Variante para usar desde el servidor MCP: no bloquea y NO escribe en stdout (que es el canal del protocolo).
 * Resuelve con el código de salida; la salida de error queda acotada para poder informarla.
 */
export function installChromiumAsync(): Promise<{ status: number; stderr: string }> {
  const playwrightEntry = fileURLToPath(import.meta.resolve('playwright'));
  const playwrightCli = path.join(path.dirname(playwrightEntry), 'cli.js');
  return new Promise(resolve => {
    const child = spawn(process.execPath, [playwrightCli, 'install', 'chromium'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-2000); });
    child.on('error', error => resolve({ status: 1, stderr: error.message }));
    child.on('close', code => resolve({ status: code ?? 1, stderr }));
  });
}
