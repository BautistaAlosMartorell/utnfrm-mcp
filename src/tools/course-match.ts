import type { Course } from '../types/index.js';

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Materias cuyo nombre contiene todas las palabras de la búsqueda (sin acentos ni mayúsculas). */
export function matchCourses(courses: Course[], query: string): Course[] {
  const wanted = normalizeText(query);
  if (!wanted) return courses;
  const tokens = wanted.split(' ');
  return courses.filter(course => {
    const name = normalizeText(course.name);
    return tokens.every(token => name.includes(token));
  });
}
