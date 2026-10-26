import { handleListCourses } from './list-courses.js';
import { requireMoodleId } from '../client/moodle-id.js';
import { matchCourses, normalizeText } from './course-match.js';
import type { Course } from '../types/index.js';

const COURSE_CACHE_TTL_MS = 5 * 60 * 1000;
let courseCache: { at: number; courses: Course[] } | undefined;

export function resetCourseCache(): void {
  courseCache = undefined;
}

/** Lista de materias con una caché de proceso de 5 minutos, para no repetir consultas entre herramientas. */
export async function listCoursesCached(): Promise<Course[]> {
  if (courseCache && Date.now() - courseCache.at < COURSE_CACHE_TTL_MS) return courseCache.courses;
  const { courses } = await handleListCourses();
  courseCache = { at: Date.now(), courses };
  return courses;
}

function looksLikeId(ref: string): boolean {
  const candidate = ref.trim();
  return /^\d{1,12}$/.test(candidate) || /^https?:\/\//i.test(candidate) || candidate.startsWith('/');
}

export type CourseRef = { id: string; name?: string };

/**
 * Resuelve una materia a partir de su ID numérico, una URL del Campus o su nombre
 * ("ciencia de datos", "IA"). Si el nombre es ambiguo, falla listando las candidatas.
 */
export async function resolveCourse(ref: string): Promise<CourseRef> {
  const candidate = ref.trim();
  if (looksLikeId(candidate)) {
    const id = requireMoodleId(candidate);
    return { id, name: courseCache?.courses.find(course => course.id === id)?.name };
  }

  const courses = await listCoursesCached();
  const wanted = normalizeText(candidate);
  const exact = courses.filter(course => normalizeText(course.name) === wanted);
  if (exact.length === 1) return { id: exact[0].id, name: exact[0].name };

  const matches = matchCourses(courses, candidate);
  if (matches.length === 1) return { id: matches[0].id, name: matches[0].name };
  const prefixed = matches.filter(course => normalizeText(course.name).startsWith(wanted));
  if (prefixed.length === 1) return { id: prefixed[0].id, name: prefixed[0].name };

  if (matches.length === 0) {
    throw new Error(`Ninguna materia coincide con "${candidate}". Usá list_courses para ver los nombres e IDs disponibles.`);
  }
  const options = matches.slice(0, 8).map(course => `[${course.id}] ${course.name}`).join('; ');
  throw new Error(`Varias materias coinciden con "${candidate}": ${options}. Indicá el ID numérico de la que querés.`);
}
