/**
 * Catálogo de comandos del CLI: única fuente de la ayuda (`--help`) y de la validación de flags.
 * El orden de las listas es el orden en que se muestran.
 */
export type CommandSpec = {
  name: string;
  aliases?: string[];
  group: (typeof GROUPS)[number];
  summary: string;
  usage?: string;
  flags?: Array<{ flag: string; description: string }>;
};

export const GROUPS = ['Empezar', 'Sesión', 'Instalación', 'Conectar tu cliente de IA', 'Uso'] as const;

export const GLOBAL_FLAGS = [
  { flag: '-h, --help', description: 'Muestra esta ayuda (o la de un comando: `utn-mcp-mendoza <comando> --help`).' },
  { flag: '-v, --version', description: 'Muestra la versión.' }
];

export const COMMANDS: CommandSpec[] = [
  { name: 'setup-wizard', aliases: ['init'], group: 'Empezar', summary: 'Asistente guiado: revisa tu equipo, instala el navegador, inicia sesión y conecta tu cliente.', flags: [
    { flag: '--yes', description: 'Acepta las opciones por defecto, sin preguntar.' },
    { flag: '--no-login', description: 'Omite el inicio de sesión.' },
    { flag: '--no-register', description: 'No toca la configuración de tus clientes de IA.' }
  ] },
  { name: 'doctor', group: 'Empezar', summary: 'Diagnóstico en una pantalla: equipo, Campus, Autogestión, correo y clientes, con qué hacer en cada punto.', flags: [
    { flag: '--offline', description: 'No consulta a los sitios (solo revisa lo local).' }
  ] },

  { name: 'login', group: 'Sesión', summary: 'Abre el navegador con el Campus, Autogestión y el Webmail para iniciar sesión (guarda solo las cookies).' },
  { name: 'status', group: 'Sesión', summary: 'Comprueba la sesión del Campus sin eliminarla.' },
  { name: 'whoami', group: 'Sesión', summary: 'Muestra tu perfil del Campus.' },
  { name: 'logout', group: 'Sesión', summary: 'Elimina la sesión local (cookies).' },
  { name: 'forget-credentials', group: 'Sesión', summary: 'Elimina el usuario y la contraseña UTN guardados.' },

  { name: 'install-browser', group: 'Instalación', summary: 'Descarga el Chromium de esta versión del MCP (no pide permisos).', flags: [
    { flag: '--with-deps', description: 'Atajo: corre antes `install-deps` (bibliotecas del sistema, Linux).' },
    { flag: '-y, --yes', description: 'Con --with-deps: no pide confirmación.' }
  ] },
  { name: 'install-deps', group: 'Instalación', summary: 'Linux: instala las bibliotecas del sistema que necesita Chromium (apt, dnf o pacman; con sudo, doas o pkexec). Muestra el comando y pide confirmación.', flags: [
    { flag: '-y, --yes', description: 'No pide confirmación.' }
  ] },

  { name: 'setup-claude', group: 'Conectar tu cliente de IA', summary: 'Registra el MCP en Claude Code.', flags: [{ flag: '--print', description: 'Solo imprime el comando, no lo ejecuta.' }] },
  { name: 'setup-codex', group: 'Conectar tu cliente de IA', summary: 'Registra el MCP en Codex.', flags: [{ flag: '--print', description: 'Solo imprime el comando, no lo ejecuta.' }] },
  { name: 'setup-opencode', group: 'Conectar tu cliente de IA', summary: 'Registra el MCP en OpenCode.', flags: [{ flag: '--print', description: 'Solo imprime el comando, no lo ejecuta.' }] },
  { name: 'setup', group: 'Conectar tu cliente de IA', summary: 'Imprime la configuración JSON para otros clientes (Claude Desktop, Cursor, VS Code, Antigravity).' },

  { name: 'start', group: 'Uso', summary: 'Inicia el servidor MCP por stdio. Es lo que hace el comando sin argumentos.' },
  { name: 'digest', group: 'Uso', summary: 'Resumen de lo que vence y los avisos nuevos.', flags: [
    { flag: '--days=<n>', description: 'Ventana en días, de 1 a 60 (por defecto 7).' },
    { flag: '--notify', description: 'Muestra una notificación del sistema.' },
    { flag: '--json', description: 'Salida en JSON.' },
    { flag: '--all-courses', description: 'Incluye todas las materias, no solo las activas.' },
    { flag: '--schedule-help', description: 'Explica cómo programarlo (cron, systemd, Programador de tareas).' }
  ] },
  { name: 'test', group: 'Uso', summary: 'Comprueba lecturas del Campus sin guardar contenido ni ejecutar escrituras.' },
  { name: 'approve-assignment', group: 'Uso', usage: 'approve-assignment <id>', summary: 'Revisa y aprueba una entrega desde una terminal local.' }
];

export function findCommand(name: string): CommandSpec | undefined {
  return COMMANDS.find(command => command.name === name || command.aliases?.includes(name));
}

const flagNames = (flag: string): string[] => flag.split(',').map(part => part.trim().replace(/=.*$/, ''));

/** Flags que empiezan con "-" y el comando no declara (evita que un error de tipeo se ignore en silencio). */
export function unknownFlags(spec: CommandSpec, args: string[]): string[] {
  const allowed = new Set([...GLOBAL_FLAGS, ...(spec.flags ?? [])].flatMap(entry => flagNames(entry.flag)));
  return args.filter(arg => arg.startsWith('-') && !allowed.has(arg.replace(/=.*$/, '')));
}

const pad = (text: string, width: number) => text.padEnd(width);

export function helpText(version: string): string {
  const lines = [`utn-mcp-mendoza ${version} — MCP del Campus, Autogestión y correo de UTN FRM`, '', 'Uso: utn-mcp-mendoza [comando] [flags]', ''];
  const width = Math.max(...COMMANDS.map(command => (command.usage ?? command.name).length)) + 2;
  for (const group of GROUPS) {
    lines.push(`${group}:`);
    for (const command of COMMANDS.filter(entry => entry.group === group)) {
      const alias = command.aliases?.length ? ` (alias: ${command.aliases.join(', ')})` : '';
      lines.push(`  ${pad(command.usage ?? command.name, width)}${command.summary}${alias}`);
    }
    lines.push('');
  }
  lines.push('Flags generales:');
  for (const entry of GLOBAL_FLAGS) lines.push(`  ${pad(entry.flag, width)}${entry.description}`);
  lines.push('', 'Cada comando con flags las muestra con: utn-mcp-mendoza <comando> --help');
  return lines.join('\n');
}

export function commandHelp(spec: CommandSpec): string {
  const lines = [`utn-mcp-mendoza ${spec.usage ?? spec.name}${spec.flags?.length ? ' [flags]' : ''}`, '', spec.summary];
  if (spec.aliases?.length) lines.push(`Alias: ${spec.aliases.join(', ')}`);
  if (spec.flags?.length) {
    lines.push('', 'Flags:');
    const width = Math.max(...spec.flags.map(entry => entry.flag.length)) + 2;
    for (const entry of spec.flags) lines.push(`  ${pad(entry.flag, width)}${entry.description}`);
  }
  return lines.join('\n');
}
