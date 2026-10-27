import { clearActiveCourses, readActiveCourseIds, writeActiveCourseIds } from '../session/profile.js';
import type { Course } from '../types/index.js';
import { listCoursesCached, resolveCourse } from './course-ref.js';

export interface ActiveCoursesInput {
  courses?: string[];
  clear?: boolean;
}

export interface ActiveCoursesResult {
  active: Array<{ id: string; name: string }>;
  count: number;
  message: string;
}

/** Guarda (o borra con `clear`) las materias del cuatrimestre. Con `courses` omitido solo consulta el perfil. */
export async function handleSetActiveCourses(input: ActiveCoursesInput = {}): Promise<ActiveCoursesResult> {
  if (input.clear) {
    clearActiveCourses();
    return { active: [], count: 0, message: 'Perfil borrado: las herramientas vuelven a revisar todas tus materias.' };
  }
  const all = await listCoursesCached();
  if (input.courses && input.courses.length > 0) {
    const ids: string[] = [];
    for (const reference of input.courses) {
      const resolved = await resolveCourse(reference);
      if (!all.some(course => course.id === resolved.id)) {
        throw new Error(`La materia "${reference}" no figura entre tus materias inscriptas. Usá list_courses para ver las disponibles.`);
      }
      if (!ids.includes(resolved.id)) ids.push(resolved.id);
    }
    writeActiveCourseIds(ids);
  }
  const ids = new Set(readActiveCourseIds());
  const active = all.filter(course => ids.has(course.id)).map(course => ({ id: course.id, name: course.name }));
  return {
    active,
    count: active.length,
    message: active.length > 0
      ? 'get_deadlines y get_announcements van a revisar solo estas materias (all_courses: true las revisa todas).'
      : 'Todavía no definiste las materias del cuatrimestre: se revisan todas. Usá set_active_courses con sus nombres.'
  };
}

export type CourseScope = { courses: Array<{ id: string; name?: string }>; scope: 'perfil' | 'todas'; warning?: string };

/** Materias a recorrer cuando no se pidió una puntual: las del perfil si existe, o todas. */
export async function scopeCourses(allCourses?: boolean): Promise<CourseScope> {
  const all: Course[] = await listCoursesCached();
  const everything = all.map(course => ({ id: course.id, name: course.name }));
  if (allCourses) return { courses: everything, scope: 'todas' };
  const ids = new Set(readActiveCourseIds());
  if (ids.size === 0) return { courses: everything, scope: 'todas' };
  const chosen = everything.filter(course => ids.has(course.id));
  if (chosen.length === 0) {
    return { courses: everything, scope: 'todas', warning: 'Ninguna de las materias del perfil figura hoy entre tus inscripciones; se revisaron todas. Actualizá el perfil con set_active_courses.' };
  }
  return { courses: chosen, scope: 'perfil' };
}
