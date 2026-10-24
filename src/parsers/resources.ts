import * as cheerio from 'cheerio';
import { ResourceItem } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';

export function parseCourseResources(html: string): ResourceItem[] {
  const $ = cheerio.load(html);
  const items: ResourceItem[] = [];
  const seenUrls = new Set<string>();

  // 1. Recorrer secciones o temas del curso si están estructuradas
  // En Moodle: li.section, div.course-section, div.section
  const sections = $('li.section, div.course-section, div.section');

  if (sections.length > 0) {
    sections.each((_, secEl) => {
      const $sec = $(secEl);
      const sectionTitle = $sec.find('.sectionname, .section-title, h3, h4').first().text().trim().replace(/\s+/g, ' ');

      // Buscar enlaces dentro de la sección
      $sec.find('a[href]').each((_, aEl) => {
        const item = extractResourceFromLink($(aEl), sectionTitle);
        if (item && !seenUrls.has(item.url)) {
          seenUrls.add(item.url);
          items.push(item);
        }
      });
    });
  } else {
    // Si no hay estructura de secciones explícita, recorrer todo el documento
    $('a[href]').each((_, aEl) => {
      const item = extractResourceFromLink($(aEl));
      if (item && !seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        items.push(item);
      }
    });
  }

  return items;
}

function extractResourceFromLink($a: cheerio.Cheerio<any>, sectionTitle?: string): ResourceItem | null {
  const href = $a.attr('href');
  if (!href) return null;

  try {
    const url = new URL(href, CAMPUS_ORIGIN);
    const pathname = url.pathname;

    let type: ResourceItem['type'] | null = null;

    if (pathname.includes('/mod/resource/view.php')) {
      type = 'resource';
    } else if (pathname.includes('/mod/folder/view.php')) {
      type = 'folder';
    } else if (pathname.includes('/mod/url/view.php')) {
      type = 'url';
    } else if (pathname.includes('/mod/page/view.php')) {
      type = 'page';
    } else if (pathname.includes('/pluginfile.php')) {
      type = 'file';
    }

    // Descartar si no es un tipo de recurso relevante
    if (!type) return null;

    const id = url.searchParams.get('id') || pathname.split('/').pop() || '';
    let name = $a.text().trim().replace(/\s+/g, ' ');

    // Limpieza de textos de accesibilidad de Moodle ("Archivo", "Carpeta", etc.)
    name = name
      .replace(/^(archivo|recurso|carpeta|página|enlace url)\s*:\s*/i, '')
      .replace(/\s*(archivo|carpeta|página|enlace url)$/i, '')
      .trim();

    if (!name || /^(ver|descargar|abrir)$/i.test(name)) {
      // Buscar si hay texto adyacente o span con el título
      const parentText = $a.closest('.activityinstance, .activity-item').find('.instancename').text().trim();
      if (parentText) {
        name = parentText.replace(/\s+/g, ' ').trim();
      }
    }

    if (!name) return null;

    return {
      id,
      name,
      type,
      section: sectionTitle || undefined,
      url: url.href
    };
  } catch {
    return null;
  }
}
