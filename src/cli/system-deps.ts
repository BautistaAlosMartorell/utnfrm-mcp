/**
 * Bibliotecas del sistema que necesita Chromium en Linux. Playwright solo las instala solo en Debian/Ubuntu y siempre con
 * `sudo`; acá se elige el gestor de paquetes (apt, dnf, pacman) y la herramienta de permisos (sudo, doas, pkexec) que haya.
 */
export type PackageManager = 'apt' | 'dnf' | 'pacman';

// shortcut: nombres de paquete de dnf y pacman tomados de sus repositorios, sin probar en Fedora ni Arch; sumar otro gestor es una fila acá.
const MANAGERS: Record<PackageManager, { command: string; install: string[]; packages: string[] }> = {
  // apt cambia nombres entre versiones (libasound2 → libasound2t64): lo resuelve el propio `playwright install-deps`.
  apt: { command: 'apt-get', install: [], packages: [] },
  dnf: {
    command: 'dnf', install: ['install', '-y'],
    packages: ['nss', 'nspr', 'atk', 'at-spi2-atk', 'cups-libs', 'libdrm', 'libxkbcommon', 'libXcomposite', 'libXdamage', 'libXrandr', 'libXfixes', 'mesa-libgbm', 'pango', 'cairo', 'alsa-lib', 'libxshmfence']
  },
  pacman: {
    command: 'pacman', install: ['-S', '--needed', '--noconfirm'],
    packages: ['nss', 'nspr', 'atk', 'at-spi2-core', 'cups', 'libdrm', 'libxkbcommon', 'libxcomposite', 'libxdamage', 'libxrandr', 'libxfixes', 'mesa', 'pango', 'cairo', 'alsa-lib', 'libxshmfence']
  }
};

const ESCALATION = ['sudo', 'doas', 'pkexec'] as const;

export type DependencyPlan =
  | { ok: true; manager: PackageManager; argv: string[] }
  | { ok: false; reason: 'unsupported' | 'no-privilege'; message: string };

export function planDependencyInstall(env: {
  has: (command: string) => boolean;
  isRoot: boolean;
  /** Para apt: `node ruta/cli.js` de Playwright, que instala los paquetes correctos de cada versión de Ubuntu/Debian. */
  playwrightCommand: string[];
}): DependencyPlan {
  const manager = (Object.keys(MANAGERS) as PackageManager[]).find(name => env.has(MANAGERS[name].command));
  if (!manager) {
    return { ok: false, reason: 'unsupported', message: 'No reconocí tu gestor de paquetes (apt, dnf o pacman). Instalá a mano las bibliotecas de Chromium (nss, nspr, atk, at-spi2, cups, libdrm, libxkbcommon, libXcomposite, libXdamage, libXrandr, mesa-libgbm, pango, cairo y alsa).' };
  }
  const escalate = env.isRoot ? [] : ESCALATION.filter(tool => env.has(tool)).slice(0, 1);
  if (!env.isRoot && escalate.length === 0) {
    return { ok: false, reason: 'no-privilege', message: 'Instalar las bibliotecas necesita permisos de administrador y no encontré sudo, doas ni pkexec. Ejecutá este comando como root o instalá una de esas herramientas.' };
  }
  const { command, install, packages } = MANAGERS[manager];
  const argv = manager === 'apt'
    ? [...escalate, ...env.playwrightCommand, 'install-deps', 'chromium']
    : [...escalate, command, ...install, ...packages];
  return { ok: true, manager, argv };
}
