import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { isInstalled } from './clients.js';
import { planDependencyInstall } from './system-deps.js';

export type InstallDepsOptions = {
  /** Instala sin preguntar (para scripts). */
  yes?: boolean;
  /** Pregunta sí/no; por defecto lee una línea de la terminal. Las pruebas inyectan otra. */
  confirm?: (question: string) => boolean;
};

/** Lee una línea de la terminal (síncrono, como el resto de la instalación). Sin terminal interactiva, nunca confirma. */
function askYesNo(question: string): boolean {
  if (!process.stdin.isTTY) return false;
  process.stdout.write(question);
  const buffer = Buffer.alloc(256);
  let line = '';
  try {
    while (!line.includes('\n')) {
      const read = fs.readSync(0, buffer, 0, buffer.length, null);
      if (read === 0) break;
      line += buffer.toString('utf8', 0, read);
    }
  } catch { return false; }
  return /^\s*(s|sí|si|y|yes)\s*$/i.test(line);
}

const PRIVILEGE_TOOLS = ['sudo', 'doas', 'pkexec'];

/**
 * Instala las bibliotecas del sistema que necesita Chromium (solo Linux), por pasos: gestor de paquetes → herramienta de
 * permisos → comando exacto → confirmación → instalación. Si algún paso no se puede, dice cuál y no ejecuta nada.
 * Devuelve el código de salida (0 también si la persona decide no instalar).
 */
export function installSystemDeps(options: InstallDepsOptions = {}): number {
  if (process.platform !== 'linux') {
    console.log('Este paso es solo para Linux: en Windows y macOS Chromium no necesita bibliotecas extra.');
    return 0;
  }
  const playwrightEntry = fileURLToPath(import.meta.resolve('playwright'));
  const playwrightCli = path.join(path.dirname(playwrightEntry), 'cli.js');
  const plan = planDependencyInstall({ has: command => isInstalled(command), isRoot: process.getuid?.() === 0, playwrightCommand: [process.execPath, playwrightCli] });
  if (!plan.ok) {
    console.error(plan.message);
    return 1;
  }
  const tool = PRIVILEGE_TOOLS.includes(plan.argv[0]!) ? plan.argv[0] : 'ninguna (ya sos root)';
  console.log(`Paso 1/3 — Gestor de paquetes: ${plan.manager}`);
  console.log(`Paso 2/3 — Permisos de administrador con: ${tool}`);
  console.log(`Paso 3/3 — Se va a ejecutar:\n\n  ${plan.argv.join(' ')}\n`);
  if (!options.yes) {
    const confirmed = (options.confirm ?? askYesNo)('¿Ejecutarlo ahora? [s/N] ');
    if (!confirmed) {
      if (!options.confirm && !process.stdin.isTTY) {
        console.error('\nNo hay una terminal interactiva para confirmar. Repetí con --yes para instalarlas sin preguntar, o ejecutá el comando de arriba a mano.');
        return 1;
      }
      console.log('\nNo se instaló nada. Si Chromium no abre, ejecutá el comando de arriba a mano.');
      return 0;
    }
  }
  const result = spawnSync(plan.argv[0]!, plan.argv.slice(1), { stdio: 'inherit' });
  if (result.error) throw result.error;
  return result.status ?? 1;
}
