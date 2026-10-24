import { campusClient } from '../client/campus-client.js';
import { parseCourseResources } from '../parsers/resources.js';
import { ResourceItem } from '../types/index.js';
import { PATHS } from '../config.js';
import { requireMoodleId } from '../client/moodle-id.js';

export async function handleListResources(courseId: string): Promise<{ courseId: string; resources: ResourceItem[]; count: number }> {
  const cleanId = requireMoodleId(courseId);

  if (!/^\d+$/.test(cleanId)) {
    throw new Error(`ID de materia inválido: "${courseId}". Debe ser un número identificador (ej: 1234).`);
  }

  const html = await campusClient.getHtml(PATHS.courseView(cleanId));
  const resources = parseCourseResources(html);

  return {
    courseId: cleanId,
    resources,
    count: resources.length
  };
}
