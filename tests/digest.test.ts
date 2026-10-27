import { describe, expect, it, vi } from 'vitest';
import { buildDigest, notify, scheduleHelp, type DigestDeps } from '../src/cli/digest.js';
import type { Deadline, DeadlinesResult } from '../src/tools/get-deadlines.js';
import type { AnnouncementsResult } from '../src/tools/get-announcements.js';

const NOW = new Date('2026-10-26T15:00:00Z');
const item = (name: string, dueIso: string, status: Deadline['status'], daysLeft: number): Deadline => ({
  course: { id: '1', name: 'Informática Industrial' }, kind: 'assignment', name, url: 'u', due: 'x', dueIso, daysLeft, status
});
const deadlines = (items: Deadline[], warnings?: string[]): DeadlinesResult => ({
  generatedAt: NOW.toISOString(), timezone: 'tz', windowDays: 7, scope: 'perfil', deadlines: items, count: items.length, coursesScanned: 1, warnings
});
const announcements = (count: number): AnnouncementsResult => ({
  scope: 'perfil', count, coursesScanned: 1,
  announcements: Array.from({ length: count }, (_, i) => ({
    id: String(i), title: `Aviso ${i + 1}`, author: 'Docente', repliesCount: 0, url: 'u', course: { id: '1', name: 'Informática Industrial' }, postedIso: '2026-10-21T20:26:00-03:00'
  }))
});
const deps = (d: DeadlinesResult, a: AnnouncementsResult): DigestDeps => ({ deadlines: vi.fn(async () => d), announcements: vi.fn(async () => a), now: () => NOW });

describe('digest', () => {
  it('lists upcoming work, overdue work and new announcements in plain text', async () => {
    const digest = await buildDigest({}, deps(deadlines([
      item('Parcial 2', '2026-10-27T16:00:00-03:00', 'pending', 0.8),
      item('Entrega TP4', '2026-11-01T23:59:00-03:00', 'pending', 6.5),
      item('TP3', '2026-10-24T23:00:00-03:00', 'overdue', -1.6)
    ]), announcements(2)));
    expect(digest.title).toBe('UTN: 2 entregas próximas · 2 avisos nuevos');
    expect(digest.summary).toBe('2 entregas en 7 días (1 en menos de 48 h) · 1 vencida · 2 avisos nuevos');
    expect(digest.text).toMatch(/Para entregar \(2\):/);
    expect(digest.text).toMatch(/Parcial 2.*⚠ menos de 24 h/);
    expect(digest.text).toMatch(/Entrega TP4 · en 7 d/);
    expect(digest.text).toMatch(/Vencido sin entregar \(1\):[\s\S]*TP3/);
    expect(digest.text).toMatch(/Avisos nuevos \(2\):[\s\S]*Aviso 1/);
  });

  it('says so when there is nothing to do and passes the window to the data sources', async () => {
    const d = deps(deadlines([]), announcements(0));
    const digest = await buildDigest({ days: 3, allCourses: true }, d);
    expect(digest.text).toMatch(/No hay entregas ni cierres/);
    expect(digest.text).toMatch(/No hay avisos nuevos/);
    expect(digest.summary).toBe('Sin entregas próximas');
    expect(d.deadlines).toHaveBeenCalledWith(3, true);
    expect(d.announcements).toHaveBeenCalledWith(3, true);
  });

  it('includes the warnings of both sources', async () => {
    const digest = await buildDigest({}, deps(deadlines([], ['No se pudieron leer las tareas de X.']), announcements(0)));
    expect(digest.text).toMatch(/Notas:[\s\S]*No se pudieron leer las tareas de X\./);
  });
});

describe('notify and schedule help', () => {
  it('uses the native notifier of each platform and strips quotes', () => {
    const run = vi.fn(() => ({ status: 0 as number | null }));
    expect(notify('Título "x"', 'Cuerpo\nlínea', 'linux', run)).toBe(true);
    expect(run).toHaveBeenCalledWith('notify-send', ['Título  x ', 'Cuerpo línea']);
    expect(notify('t', 'b', 'darwin', run)).toBe(true);
    expect(run).toHaveBeenLastCalledWith('osascript', ['-e', 'display notification "b" with title "t"']);
    expect(notify('t', 'b', 'win32', run)).toBe(false);
    expect(notify('t', 'b', 'linux', () => ({ status: 1 }))).toBe(false);
    expect(notify('t', 'b', 'linux', () => ({ status: null, error: new Error('ENOENT') }))).toBe(false);
  });

  it('explains how to schedule it on each system without installing anything', () => {
    expect(scheduleHelp('linux')).toMatch(/crontab -e[\s\S]*0 8 \* \* 1 utn-mcp-mendoza digest --notify/);
    expect(scheduleHelp('win32')).toMatch(/schtasks \/Create \/SC WEEKLY \/D MON \/ST 08:00/);
    expect(scheduleHelp('darwin')).toMatch(/launchd/);
  });
});
