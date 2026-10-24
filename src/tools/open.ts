import { campusClient } from '../client/campus-client.js';
import { parseNavigationPage } from '../parsers/navigation.js';
import { NavigationResult } from '../types/index.js';
import { PATHS } from '../config.js';
import { resolveCampusUrl } from '../client/campus-url.js';
import { requireMoodleId } from '../client/moodle-id.js';

export async function handleOpen(idOrUrl: string, sectionId?: string): Promise<NavigationResult> {
  let targetPath: string;
  if (/^\d+$/.test(idOrUrl.trim())) {
    targetPath = new URL(PATHS.courseView(requireMoodleId(idOrUrl)), resolveCampusUrl('/')).href;
  } else {
    targetPath = resolveCampusUrl(idOrUrl);
  }

  if (sectionId) {
    if (!/^\d{1,12}$/.test(sectionId)) {
      throw new Error('section_id debe ser un identificador numérico.');
    }
    const targetUrl = new URL(targetPath);
    if (targetUrl.pathname !== '/course/view.php') {
      throw new Error('section_id solo se puede usar al abrir un curso.');
    }
    targetUrl.searchParams.set('section', sectionId);
    targetPath = targetUrl.href;
  }

  const html = await campusClient.getHtml(targetPath);
  return parseNavigationPage(html, targetPath);
}
