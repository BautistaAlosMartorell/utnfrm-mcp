import { campusClient } from '../client/campus-client.js';
import { parseAssignmentDetail } from '../parsers/assignments.js';
import { AssignmentDetail } from '../types/index.js';
import { PATHS, CAMPUS_ORIGIN } from '../config.js';

export async function handleGetAssignment(assignmentIdOrUrl: string): Promise<AssignmentDetail> {
  let cleanId = assignmentIdOrUrl.trim();
  let fullUrl = '';

  if (cleanId.startsWith('http')) {
    try {
      const parsed = new URL(cleanId);
      const paramId = parsed.searchParams.get('id');
      if (paramId) {
        cleanId = paramId;
      }
      fullUrl = parsed.href;
    } catch {
      // Usar como vino
    }
  }

  if (!fullUrl) {
    if (!/^\d+$/.test(cleanId)) {
      throw new Error(`ID o URL de tarea inválido: "${assignmentIdOrUrl}". Debe ser el ID numérico (ej: 5678) o la URL de la tarea.`);
    }
    fullUrl = new URL(PATHS.assignView(cleanId), CAMPUS_ORIGIN).href;
  }

  const html = await campusClient.getHtml(fullUrl);
  return parseAssignmentDetail(html, fullUrl);
}
