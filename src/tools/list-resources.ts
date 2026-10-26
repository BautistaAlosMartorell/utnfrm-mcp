import { campusClient } from '../client/campus-client.js';
import { parseCourseResources } from '../parsers/resources.js';
import { ResourceItem } from '../types/index.js';
import { PATHS } from '../config.js';
import { resolveCourse } from './course-ref.js';
import { handleGetCourseContents } from './get-course-contents.js';

const RESOURCE_TYPES: Record<string, ResourceItem['type']> = {
  resource: 'resource',
  folder: 'folder',
  external_url: 'url',
  page: 'page',
  forum: 'forum',
  assignment: 'assign',
  choice: 'choice',
  quiz: 'quiz'
};

/**
 * Materiales de una materia. Usa el contenido por secciones (que funciona también con el formato tiles,
 * donde la página principal solo trae la sección General) y, si no devuelve nada, el análisis clásico
 * de la página del curso.
 */
export async function handleListResources(courseId: string): Promise<{ courseId: string; resources: ResourceItem[]; count: number }> {
  const course = await resolveCourse(courseId);
  const cleanId = course.id;

  if (!/^\d+$/.test(cleanId)) {
    throw new Error(`ID de materia inválido: "${courseId}". Debe ser un número identificador (ej: 1234).`);
  }

  const contents = await handleGetCourseContents({ course_id: cleanId, include_labels: false });
  const resources: ResourceItem[] = contents.sections.flatMap(section =>
    section.activities
      .filter(activity => activity.url)
      .map(activity => ({
        id: activity.id,
        name: activity.name,
        type: RESOURCE_TYPES[activity.type] ?? 'other',
        section: section.name,
        url: activity.url!
      }))
  );

  if (resources.length === 0) {
    const html = await campusClient.getHtml(PATHS.courseView(cleanId));
    const fallback = parseCourseResources(html);
    return { courseId: cleanId, resources: fallback, count: fallback.length };
  }

  return {
    courseId: cleanId,
    resources,
    count: resources.length
  };
}
