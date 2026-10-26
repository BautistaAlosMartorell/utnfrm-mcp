import { campusClient } from '../client/campus-client.js';
import { hasExplicitEmptyCoursesMessage, parseCourses } from '../parsers/courses.js';
import { Course } from '../types/index.js';
import { PATHS } from '../config.js';
import { rethrowTerminalCampusFailure } from '../client/campus-error-kind.js';
import { matchCourses } from './course-match.js';

export async function handleListCourses(query?: string): Promise<{ courses: Course[]; count: number; query?: string }> {
  // Intentar primero lectura directa HTTP de /my/courses.php
  let html = '';
  let lastReadError: unknown;
  try {
    html = await campusClient.getHtml(PATHS.courses);
  } catch (error) {
    rethrowTerminalCampusFailure(error);
    lastReadError = error;
    // Fallback a /my/
    html = await campusClient.getHtml(PATHS.dashboard);
  }

  let courses = parseCourses(html);

  // Si no se detectaron cursos en el HTML estático de /my/courses.php,
  // probar con /my/ o con renderizado headless ligero (Moodle Boost carga tarjetas por JS en ciertos temas)
  if (courses.length === 0) {
    try {
      const dashboardHtml = await campusClient.getHtml(PATHS.dashboard);
      html = dashboardHtml;
      courses = parseCourses(dashboardHtml);
    } catch (error) {
      rethrowTerminalCampusFailure(error);
      lastReadError = error;
      // Ignorar error y probar renderizado si aún está vacío
    }
  }

  if (courses.length === 0) {
    try {
      const renderedHtml = await campusClient.getRenderedHtml(PATHS.courses, '.coursebox, .dashboard-card, a[href*="/course/view.php"]');
      html = renderedHtml;
      courses = parseCourses(renderedHtml);
    } catch (error) {
      rethrowTerminalCampusFailure(error);
      lastReadError = error;
      // Si falla el renderizado, conservar lo que tengamos
    }
  }

  if (courses.length === 0 && lastReadError) throw lastReadError;
  if (courses.length === 0 && !hasExplicitEmptyCoursesMessage(html)) {
    throw new Error('Moodle no confirmó una lista vacía de materias y no se pudieron reconocer cursos en la página. Revisá el estado del Campus antes de interpretar el resultado.');
  }

  const trimmed = query?.trim();
  if (trimmed) {
    const filtered = matchCourses(courses, trimmed);
    return { courses: filtered, count: filtered.length, query: trimmed };
  }

  return {
    courses,
    count: courses.length
  };
}
