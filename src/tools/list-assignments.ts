import { campusClient } from '../client/campus-client.js';
import { parseAssignmentsIndex } from '../parsers/assignments.js';
import { AssignmentSummary } from '../types/index.js';
import { PATHS } from '../config.js';
import { resolveCourse } from './course-ref.js';
import { rethrowTerminalCampusFailure } from '../client/campus-error-kind.js';

export async function handleListAssignments(courseId: string): Promise<{ courseId: string; assignments: AssignmentSummary[]; count: number }> {
  // Limpiar el courseId en caso de que hayan pasado una URL completa
  const cleanId = (await resolveCourse(courseId)).id;

  if (!/^\d+$/.test(cleanId)) {
    throw new Error(`ID de materia inválido: "${courseId}". Debe ser un número identificador (ej: 1234).`);
  }

  // 1. Intentar obtener el índice estándar de tareas del curso
  let html = '';
  try {
    html = await campusClient.getHtml(PATHS.assignIndex(cleanId));
  } catch {
    // Si la página de índice devuelve error o no existe, leer directamente el curso
    html = await campusClient.getHtml(PATHS.courseView(cleanId));
  }

  let assignments = parseAssignmentsIndex(html);

  // Si no se encontraron tareas en el índice de tareas, intentar también en la página principal del curso
  if (assignments.length === 0 && !html.includes('class="course-content"')) {
    try {
      const courseHtml = await campusClient.getHtml(PATHS.courseView(cleanId));
      assignments = parseAssignmentsIndex(courseHtml);
    } catch (error) {
      rethrowTerminalCampusFailure(error);
      // Ignorar error secundario
    }
  }

  return {
    courseId: cleanId,
    assignments,
    count: assignments.length
  };
}
