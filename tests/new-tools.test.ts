import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const campus = vi.hoisted(() => ({ getHtml: vi.fn(), downloadBuffer: vi.fn() }));
const listCourses = vi.hoisted(() => vi.fn());
vi.mock('../src/client/campus-client.js', () => ({ campusClient: campus }));
vi.mock('../src/tools/list-courses.js', () => ({ handleListCourses: listCourses }));

import {
  DownloadFileInputSchema,
  GetAnnouncementsInputSchema,
  GetCourseContentsInputSchema,
  GetDeadlinesInputSchema,
  GetQuizInfoInputSchema,
  ListCoursesInputSchema,
  ReadFileInputSchema
} from '../src/types/index.js';
import { listCoursesCached, resetCourseCache } from '../src/tools/course-ref.js';
import { handleGetAnnouncements } from '../src/tools/get-announcements.js';
import { handleGetCourseContents } from '../src/tools/get-course-contents.js';
import { handleGetDeadlines } from '../src/tools/get-deadlines.js';
import { handleGetQuizInfo } from '../src/tools/get-quiz-info.js';
import { handleListResources } from '../src/tools/list-resources.js';
import { resolveForumView } from '../src/tools/forums.js';

const fixture = (name: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');

function pages(map: Record<string, string>) {
  campus.getHtml.mockImplementation(async (target: string) => {
    const key = Object.keys(map).find(candidate => target.includes(candidate));
    if (!key) throw new Error(`HTTP 404 inesperado: ${target}`);
    return map[key];
  });
}

beforeEach(() => {
  resetCourseCache();
  campus.getHtml.mockReset();
  listCourses.mockReset();
  listCourses.mockResolvedValue({ courses: [{ id: '9', name: 'Materia de Prueba', url: 'u' }, { id: '8', name: 'Informática de Prueba', url: 'u' }], count: 2 });
});

describe('new tool schemas', () => {
  it('validates the optional and required arguments', () => {
    expect(ListCoursesInputSchema.safeParse({}).success).toBe(true);
    expect(ListCoursesInputSchema.safeParse({ query: 'redes' }).success).toBe(true);
    expect(GetCourseContentsInputSchema.safeParse({ course_id: 'ciencia de datos', section: '3' }).success).toBe(true);
    expect(GetCourseContentsInputSchema.safeParse({}).success).toBe(false);
    expect(GetDeadlinesInputSchema.safeParse({}).success).toBe(true);
    expect(GetDeadlinesInputSchema.safeParse({ days_ahead: 0 }).success).toBe(false);
    expect(GetDeadlinesInputSchema.safeParse({ days_ahead: 400 }).success).toBe(false);
    expect(GetAnnouncementsInputSchema.safeParse({ limit: 51 }).success).toBe(false);
    expect(GetQuizInfoInputSchema.safeParse({ quiz_id: '5' }).success).toBe(true);
    expect(DownloadFileInputSchema.safeParse({ url: '/mod/resource/view.php?id=1' }).success).toBe(true);
    expect(DownloadFileInputSchema.safeParse({}).success).toBe(false);
    expect(ReadFileInputSchema.safeParse({ url: '/x', full: true }).success).toBe(true);
  });
});

describe('get_course_contents', () => {
  it('fills the tile sections that the main page leaves empty, one request each', async () => {
    pages({ 'id=9&section=2': fixture('course-tiles-section.html'), 'id=9&section=1': fixture('course-tiles-section.html').replace(/section-2/g, 'section-1').replace('Unidad 1', 'Unidad 0'), 'course/view.php?id=9': fixture('course-tiles-main.html') });
    const result = await handleGetCourseContents({ course_id: 'materia de prueba' });
    expect(result.courseId).toBe('9');
    expect(result.sections.map(section => [section.number, section.name, section.activities.length])).toEqual([[0, 'General', 1], [1, 'Unidad 0', 4], [2, 'Unidad 1', 4]]);
    expect(result.activityCount).toBe(9);
    expect(campus.getHtml).toHaveBeenCalledTimes(3);
  });

  it('reads only the requested section by name and can drop labels', async () => {
    pages({ 'id=9&section=2': fixture('course-tiles-section.html'), 'course/view.php?id=9': fixture('course-tiles-main.html') });
    const result = await handleGetCourseContents({ course_id: '9', section: 'unidad 1', include_labels: false });
    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].activities.map(activity => activity.type)).toEqual(['resource', 'assignment', 'external_url']);
    expect(campus.getHtml).toHaveBeenCalledTimes(2);
  });

  it('lists the available sections when the selector matches nothing', async () => {
    pages({ 'course/view.php?id=9': fixture('course-tiles-main.html') });
    await expect(handleGetCourseContents({ course_id: '9', section: 'unidad 9' })).rejects.toThrow(/Secciones disponibles: 0: General; 1: Unidad 0; 2: Unidad 1/);
  });

  it('keeps going with a warning if one section cannot be read, but not on auth failures', async () => {
    campus.getHtml.mockImplementation(async (target: string) => {
      if (target.includes('section=1')) throw new Error('Fallo de red');
      if (target.includes('section=2')) return fixture('course-tiles-section.html');
      return fixture('course-tiles-main.html');
    });
    const result = await handleGetCourseContents({ course_id: '9' });
    expect(result.warnings).toEqual(['No se pudo leer la sección 1 (Unidad 0).']);
    campus.getHtml.mockImplementation(async (target: string) => {
      if (target.includes('section=')) throw new Error('La sesión del Campus Virtual expiró.');
      return fixture('course-tiles-main.html');
    });
    await expect(handleGetCourseContents({ course_id: '9' })).rejects.toThrow(/expiró/);
  });

  it('powers list_resources on tile courses with the original output shape', async () => {
    pages({ 'id=9&section=2': fixture('course-tiles-section.html'), 'id=9&section=1': fixture('course-tiles-section.html'), 'course/view.php?id=9': fixture('course-tiles-main.html') });
    const result = await handleListResources('9');
    expect(result.courseId).toBe('9');
    const types = new Set(result.resources.map(resource => resource.type));
    expect(types).toEqual(new Set(['forum', 'resource', 'assign', 'url']));
    expect(result.resources.every(resource => resource.url.startsWith('https://'))).toBe(true);
  });
});

describe('get_deadlines', () => {
  const now = Date.now();
  const stamp = (days: number) => {
    const date = new Date(now + days * 86_400_000 - 3 * 3_600_000);
    const names = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `lunes, ${date.getUTCDate()} de ${names[date.getUTCMonth()]} de ${date.getUTCFullYear()}, ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
  };
  const row = (id: string, name: string, due: string, status: string, grade = '-') =>
    `<tr><td></td><td><a href="view.php?id=${id}">${name}</a></td><td>${due}</td><td>${status}</td><td>${grade}</td></tr>`;
  const table = (rows: string) => `<table class="generaltable"><thead><tr><th>Mosaico</th><th>Tareas</th><th>Fecha de entrega</th><th>Entrega</th><th>Calificación</th></tr></thead><tbody>${rows}</tbody></table>`;

  it('sorts upcoming work, hides what is done or long overdue, and marks overdue items', async () => {
    pages({
      '/mod/assign/index.php?id=9': table([
        row('1', 'Entrega lejana', stamp(10), 'No entregado'),
        row('2', 'Entrega próxima', stamp(2), 'Sin entrega'),
        row('3', 'Ya enviada', stamp(3), 'Enviado para calificar', '90,00'),
        row('4', 'Vencida reciente', stamp(-3), 'No entregado'),
        row('5', 'Vencida vieja', stamp(-90), 'No entregado'),
        row('6', 'Sin fecha', 'Sin fecha', 'No entregado'),
        row('7', 'Fuera de ventana', stamp(200), 'No entregado')
      ].join('')),
      '/mod/quiz/index.php?id=9': `<table class="generaltable"><thead><tr><th>Mosaico</th><th>Nombre</th><th>El cuestionario se cerrará el</th><th>Calificación</th></tr></thead><tbody><tr><td></td><td><a href="view.php?id=50">Cuestionario cercano</a></td><td>${stamp(1)}</td><td></td></tr></tbody></table>`
    });
    const result = await handleGetDeadlines({ course_id: '9', days_ahead: 30 });
    expect(result.deadlines.map(item => [item.name, item.status])).toEqual([
      ['Vencida reciente', 'overdue'],
      ['Cuestionario cercano', 'pending'],
      ['Entrega próxima', 'pending'],
      ['Entrega lejana', 'pending']
    ]);
    const withDone = await handleGetDeadlines({ course_id: '9', days_ahead: 30, include_completed: true, include_overdue: false });
    expect(withDone.deadlines.map(item => item.name)).toContain('Ya enviada');
    expect(withDone.deadlines.map(item => item.name)).not.toContain('Vencida reciente');
  });

  it('scans every course when none is given and reports courses that failed', async () => {
    campus.getHtml.mockImplementation(async (target: string) => {
      if (target.includes('id=8')) throw new Error('Fallo de red');
      return target.includes('/mod/assign/') ? table(row('1', 'Entrega X', stamp(2), 'No entregado')) : '<html></html>';
    });
    const result = await handleGetDeadlines({});
    expect(result.coursesScanned).toBe(2);
    expect(result.deadlines).toHaveLength(1);
    expect(result.deadlines[0].course).toEqual({ id: '9', name: 'Materia de Prueba' });
    expect(result.warnings).toEqual([
      'No se pudieron leer las tareas de Informática de Prueba.',
      'No se pudieron leer los cuestionarios de Informática de Prueba.'
    ]);
  });
});

describe('get_announcements', () => {
  it('finds the news forum, filters by date and attaches the body of the newest items', async () => {
    pages({
      'course/view.php?id=8': fixture('course-topics.html'),
      '/mod/forum/view.php?id=1': fixture('forum-moodle4.html'),
      '/mod/forum/discuss.php?d=6410': fixture('discuss-moodle4.html')
    });
    await listCoursesCached(); // con la lista de materias en caché los resultados llevan el nombre
    const result = await handleGetAnnouncements({ course_id: '8', include_body: true });
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0]).toMatchObject({ id: '6410', title: 'Fecha del parcial', postedIso: '2026-10-21T20:26:00-03:00', course: { id: '8', name: 'Informática de Prueba' } });
    expect(result.announcements[0].bodyMarkdown).toContain('El parcial será el');

    const none = await handleGetAnnouncements({ course_id: '8', since: '2026-10-22' });
    expect(none.count).toBe(0);
    await expect(handleGetAnnouncements({ course_id: '8', since: 'ayer' })).rejects.toThrow(/since debe ser/);
  });

  it('reports courses without a news forum', async () => {
    pages({ 'course/view.php?id=9': fixture('course-tiles-section.html') });
    await listCoursesCached();
    const result = await handleGetAnnouncements({ course_id: '9' });
    expect(result.coursesWithoutAnnouncements).toEqual(['Materia de Prueba']);
  });
});

describe('get_quiz_info', () => {
  it('requires exactly one of quiz_id or course_id', async () => {
    await expect(handleGetQuizInfo({})).rejects.toThrow(/Indicá quiz_id/);
    await expect(handleGetQuizInfo({ quiz_id: '1', course_id: '2' })).rejects.toThrow(/no ambos/);
    await expect(handleGetQuizInfo({ quiz_id: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=3' })).rejects.toThrow(/cuestionario/);
  });

  it('returns quiz detail and never touches the attempt endpoints', async () => {
    pages({ '/mod/quiz/view.php?id=5': fixture('quiz-attempt.html') });
    const result = await handleGetQuizInfo({ quiz_id: '5' });
    expect(result.mode).toBe('quiz');
    expect(campus.getHtml).toHaveBeenCalledTimes(1);
    expect(String(campus.getHtml.mock.calls[0][0])).toBe('/mod/quiz/view.php?id=5');
  });
});

describe('get_forum_discussions references', () => {
  it('accepts module ids and both kinds of forum URLs', () => {
    expect(resolveForumView('16227')).toEqual({ forumId: '16227', path: '/mod/forum/view.php?id=16227' });
    expect(resolveForumView('https://campusvirtual.frm.utn.edu.ar/mod/forum/view.php?id=7')).toEqual({ forumId: '7', path: '/mod/forum/view.php?id=7' });
    expect(resolveForumView('https://campusvirtual.frm.utn.edu.ar/mod/forum/view.php?f=2106')).toEqual({ forumId: '2106', path: '/mod/forum/view.php?f=2106' });
    expect(() => resolveForumView('https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=7')).toThrow(/foro/);
    expect(() => resolveForumView('https://evil.example/mod/forum/view.php?id=7')).toThrow();
  });
});
