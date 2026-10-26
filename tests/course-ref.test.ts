import { beforeEach, describe, expect, it, vi } from 'vitest';

const listCourses = vi.hoisted(() => vi.fn());
vi.mock('../src/tools/list-courses.js', () => ({ handleListCourses: listCourses }));

import { matchCourses, normalizeText } from '../src/tools/course-match.js';
import { listCoursesCached, resetCourseCache, resolveCourse } from '../src/tools/course-ref.js';

const courses = [
  { id: '296', name: 'Ciencia de Datos', url: 'u' },
  { id: '295', name: 'Redes Neuronales Profundas', url: 'u' },
  { id: '126', name: 'Inteligencia Artificial', url: 'u' },
  { id: '729', name: 'Gobierno Digital e Innovación (Teoría)', url: 'u' },
  { id: '115', name: 'Aula General de Materias Básicas', url: 'u' },
  { id: '325', name: 'ISI-Estudiantes', url: 'u' }
];

describe('course matching', () => {
  it('normalizes accents, case and punctuation', () => {
    expect(normalizeText('  Innovación (Teoría) ')).toBe('innovacion teoria');
  });

  it('matches every word, ignoring accents and order of capitalization', () => {
    expect(matchCourses(courses, 'INNOVACION').map(course => course.id)).toEqual(['729']);
    expect(matchCourses(courses, 'aula general').map(course => course.id)).toEqual(['115']);
    expect(matchCourses(courses, 'zzz')).toEqual([]);
    expect(matchCourses(courses, '   ')).toHaveLength(courses.length);
  });
});

describe('resolveCourse', () => {
  beforeEach(() => {
    resetCourseCache();
    listCourses.mockReset();
    listCourses.mockResolvedValue({ courses, count: courses.length });
  });

  it('passes numeric ids and campus URLs through without listing courses', async () => {
    await expect(resolveCourse('296')).resolves.toEqual({ id: '296', name: undefined });
    await expect(resolveCourse('https://campusvirtual.frm.utn.edu.ar/course/view.php?id=126')).resolves.toMatchObject({ id: '126' });
    expect(listCourses).not.toHaveBeenCalled();
  });

  it('resolves names and caches the course list', async () => {
    await expect(resolveCourse('ciencia de datos')).resolves.toEqual({ id: '296', name: 'Ciencia de Datos' });
    await expect(resolveCourse('redes')).resolves.toMatchObject({ id: '295' });
    await expect(resolveCourse('296')).resolves.toEqual({ id: '296', name: 'Ciencia de Datos' });
    expect(listCourses).toHaveBeenCalledTimes(1);
    await listCoursesCached();
    expect(listCourses).toHaveBeenCalledTimes(1);
  });

  it('explains ambiguity and unknown names', async () => {
    await expect(resolveCourse('de')).rejects.toThrow(/Varias materias coinciden.*\[296\] Ciencia de Datos/);
    await expect(resolveCourse('quimica')).rejects.toThrow(/Ninguna materia coincide/);
  });

  it('rejects ids that are not campus ids', async () => {
    await expect(resolveCourse('https://evil.example/course/view.php?id=1')).rejects.toThrow();
  });
});
