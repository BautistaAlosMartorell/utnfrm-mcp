import { spawnSync } from 'node:child_process';
import { handleGetAnnouncements, type AnnouncementsResult } from '../tools/get-announcements.js';
import { handleGetDeadlines, type DeadlinesResult } from '../tools/get-deadlines.js';

const TIMEZONE = 'America/Argentina/Mendoza';

export interface DigestDeps {
  deadlines: (days: number, allCourses: boolean) => Promise<DeadlinesResult>;
  announcements: (days: number, allCourses: boolean) => Promise<AnnouncementsResult>;
  now: () => Date;
}

export const defaultDigestDeps: DigestDeps = {
  deadlines: (days, allCourses) => handleGetDeadlines({ days_ahead: days, all_courses: allCourses }),
  announcements: (days, allCourses) => handleGetAnnouncements({
    since: new Date(Date.now() - days * 86_400_000).toISOString(), limit: 10, all_courses: allCourses
  }),
  now: () => new Date()
};

export type DigestOptions = { days?: number; allCourses?: boolean };
export type Digest = { title: string; summary: string; text: string; data: { deadlines: DeadlinesResult; announcements: AnnouncementsResult } };

function when(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: TIMEZONE
  });
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Resumen semanal en texto plano: qué vence, qué quedó vencido y qué avisos nuevos hay. */
export async function buildDigest(options: DigestOptions = {}, deps: DigestDeps = defaultDigestDeps): Promise<Digest> {
  const days = options.days ?? 7;
  const all = options.allCourses === true;
  const [deadlines, announcements] = await Promise.all([deps.deadlines(days, all), deps.announcements(days, all)]);

  const upcoming = deadlines.deadlines.filter(item => item.status === 'pending');
  const overdue = deadlines.deadlines.filter(item => item.status === 'overdue');
  const title = `UTN: ${plural(upcoming.length, 'entrega próxima', 'entregas próximas')} · ${plural(announcements.count, 'aviso nuevo', 'avisos nuevos')}`;

  const lines = [`Resumen de los próximos ${days} días — ${new Date(deps.now()).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TIMEZONE })}`, ''];
  lines.push(upcoming.length > 0 ? `Para entregar (${upcoming.length}):` : 'No hay entregas ni cierres en la ventana.');
  for (const item of upcoming) {
    const left = item.daysLeft === undefined ? '' : item.daysLeft < 1 ? ' ⚠ menos de 24 h' : ` · en ${Math.ceil(item.daysLeft)} d`;
    lines.push(`  • ${when(item.dueIso)} · ${item.course.name ?? item.course.id} — ${item.name}${left}`);
  }
  if (overdue.length > 0) {
    lines.push('', `Vencido sin entregar (${overdue.length}):`);
    for (const item of overdue) lines.push(`  • ${when(item.dueIso)} · ${item.course.name ?? item.course.id} — ${item.name}`);
  }
  lines.push('', announcements.count > 0 ? `Avisos nuevos (${announcements.count}):` : 'No hay avisos nuevos.');
  for (const item of announcements.announcements) {
    lines.push(`  • ${item.postedIso ? when(item.postedIso) : item.posted ?? ''} · ${item.course.name ?? item.course.id} — ${item.title}`);
  }
  const notes = [...(deadlines.warnings ?? []), ...(announcements.warnings ?? [])];
  if (notes.length > 0) lines.push('', 'Notas:', ...notes.map(note => `  - ${note}`));

  const urgent = upcoming.filter(item => (item.daysLeft ?? 99) < 2).length;
  const summary = [
    upcoming.length > 0 ? `${plural(upcoming.length, 'entrega', 'entregas')} en ${days} días${urgent > 0 ? ` (${urgent} en menos de 48 h)` : ''}` : 'Sin entregas próximas',
    overdue.length > 0 ? `${overdue.length} vencida${overdue.length === 1 ? '' : 's'}` : undefined,
    announcements.count > 0 ? plural(announcements.count, 'aviso nuevo', 'avisos nuevos') : undefined
  ].filter(Boolean).join(' · ');

  return { title, summary, text: lines.join('\n'), data: { deadlines, announcements } };
}

export type NotifyRunner = (command: string, args: string[]) => { status: number | null; error?: Error };
const defaultNotifyRunner: NotifyRunner = (command, args) => spawnSync(command, args, { stdio: 'ignore', timeout: 10000 });

/** Notificación nativa best-effort (Linux: notify-send; macOS: osascript). Devuelve false si no se pudo. */
export function notify(title: string, body: string, platform: NodeJS.Platform = process.platform, run: NotifyRunner = defaultNotifyRunner): boolean {
  const clean = (text: string) => text.replace(/["\\\r\n]/g, ' ').slice(0, 240);
  if (platform === 'linux') {
    const result = run('notify-send', [clean(title), clean(body)]);
    return !result.error && result.status === 0;
  }
  if (platform === 'darwin') {
    const result = run('osascript', ['-e', `display notification "${clean(body)}" with title "${clean(title)}"`]);
    return !result.error && result.status === 0;
  }
  return false;
}

/** Cómo programar el resumen en cada sistema (no se instala nada automáticamente). */
export function scheduleHelp(platform: NodeJS.Platform = process.platform): string {
  const command = 'utn-mcp-mendoza digest --notify';
  if (platform === 'win32') {
    return [
      'Programar el resumen cada lunes a las 8:00 (Programador de tareas de Windows):',
      `  schtasks /Create /SC WEEKLY /D MON /ST 08:00 /TN "UTN MCP resumen semanal" /TR "${command}"`,
      'Para quitarlo: schtasks /Delete /TN "UTN MCP resumen semanal" /F'
    ].join('\n');
  }
  return [
    'Programar el resumen cada lunes a las 8:00 (cron):',
    '  1. Ejecutá: crontab -e',
    `  2. Agregá la línea:  0 8 * * 1 ${command}`,
    platform === 'darwin' ? '  (En macOS también podés usar un evento de calendario o launchd.)' : '  (La notificación necesita una sesión de escritorio; si usás cron agregá DISPLAY=:0 antes del comando.)',
    'Las sesiones del Campus vencen tras unas horas: si el resumen avisa que la sesión venció, ejecutá utn-mcp-mendoza login.'
  ].join('\n');
}
