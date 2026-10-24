import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { AssignmentSummary, AssignmentDetail, Attachment } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';
import { resolveCampusUrl } from '../client/campus-url.js';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced'
});

/**
 * Parsea el listado de tareas desde la tabla de /mod/assign/index.php?id=... o la página del curso.
 */
export function parseAssignmentsIndex(html: string): AssignmentSummary[] {
  const $ = cheerio.load(html);
  const assignments: AssignmentSummary[] = [];
  const seenIds = new Set<string>();

  // 1. Buscar en la tabla general de tareas de Moodle: table.generaltable
  $('table.generaltable tr').each((_, row) => {
    const $row = $(row);
    // Ignorar encabezados
    if ($row.find('th').length > 0 && $row.find('td').length === 0) return;

    const $link = $row.find('a[href*="/mod/assign/view.php"]');
    if ($link.length === 0) return;

    const href = $link.attr('href');
    if (!href) return;

    try {
      const url = new URL(href, CAMPUS_ORIGIN);
      const id = url.searchParams.get('id');
      if (!id || seenIds.has(id)) return;

      const name = $link.text().trim();
      const cells = $row.find('td').map((_, td) => $(td).text().trim()).get();

      // En Moodle clásico, las celdas suelen ser:
      // [0] Tema/Semana | [1] Tarea | [2] Fecha de entrega | [3] Estado de entrega | [4] Calificación
      // O [0] Tarea | [1] Fecha | [2] Estado
      let dueDate: string | undefined;
      let status: string | undefined;
      let grade: string | undefined;

      // Buscar celda con fecha (días de la semana, números, meses o formato dd/mm/aaaa)
      for (const cell of cells) {
        if (cell === name) continue;
        if (/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b)/i.test(cell)) {
          if (!dueDate) dueDate = cell;
        } else if (/(\bentregad[oa]\b|\benviad[oa]\b|\bsin entrega\b|\bborrador\b|\bvencid[oa]\b|\bcalificad[oa]\b|\bno entregado\b)/i.test(cell)) {
          if (!status) status = cell;
        } else if (/(\bcalificación\b|\bnota\b|\baprobado\b|\bdesaprobado\b|\d+([,\.]\d+)?\s*\/\s*\d+)/i.test(cell)) {
          if (!grade) grade = cell;
        }
      }

      seenIds.add(id);
      assignments.push({
        id,
        name,
        url: url.href,
        dueDate,
        status,
        grade
      });
    } catch {
      // Ignorar URLs inválidas
    }
  });

  // 2. Si no hubo tabla general o solo se parseó el curso (/course/view.php), buscar enlaces individuales de asignaciones
  if (assignments.length === 0) {
    $('a[href*="/mod/assign/view.php"]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href');
      if (!href) return;

      try {
        const url = new URL(href, CAMPUS_ORIGIN);
        const id = url.searchParams.get('id');
        if (!id || seenIds.has(id)) return;

        let name = $a.text().trim();
        name = name.replace(/\s+/g, ' ').replace(/^Tarea\s*:\s*/i, '').trim();

        if (name && !/^(ver|entrar|abrir|acceder)$/i.test(name)) {
          seenIds.add(id);
          assignments.push({
            id,
            name,
            url: url.href
          });
        }
      } catch {
        // Ignorar
      }
    });
  }

  return assignments;
}

/**
 * Parsea el detalle completo de una tarea desde /mod/assign/view.php?id=...
 */
export function parseAssignmentDetail(html: string, pageUrl: string): AssignmentDetail {
  const $ = cheerio.load(html);

  // ID de la tarea
  let id = '';
  try {
    const url = new URL(pageUrl, CAMPUS_ORIGIN);
    id = url.searchParams.get('id') || '';
  } catch {
    id = '';
  }

  // Nombre de la tarea: buscar en cabecera principal, descartando drawers o paneles ("Mensajería", etc.)
  let name = '';
  $('div[role="main"] h2, .page-header-headings h1, .page-header-headings h2, .activity-header h2, h2').each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, ' ');
    if (text && !/^(mensajería|navegación|menú|notificaciones|drawer)$/i.test(text) && !name) {
      name = text;
    }
  });

  // Si no se obtuvo de los encabezados, extraer del último ítem del breadcrumb (nombre del módulo actual)
  if (!name) {
    name = $('.breadcrumb-item:last-child, ol.breadcrumb li:last-child').text().trim().replace(/\s+/g, ' ');
  }

  name = name.replace(/^Tarea\s*:\s*/i, '').trim();

  // Nombre del curso (breadcrumbs o navegación)
  const courseName = $('.breadcrumb-item a[href*="/course/view.php"], nav[aria-label*="breadcrumb"] a[href*="/course/view.php"]')
    .last()
    .text()
    .trim();

  // Consigna / Descripción
  const $intro = $('#intro, .activity-description, .box.generalbox#intro, div[role="main"] .box.py-3').first().clone();
  $intro.find('script,style,iframe,object,embed,form,button,input,textarea,select').remove();
  $intro.find('*').addBack().each((_, element) => {
    if (!('attribs' in element)) return;
    const node = $(element);
    for (const attribute of Object.keys(element.attribs || {})) {
      if (/^on/i.test(attribute) || ['srcdoc', 'style'].includes(attribute.toLowerCase())) {
        node.removeAttr(attribute);
        continue;
      }
      if (['href', 'src', 'data'].includes(attribute.toLowerCase())) {
        const value = node.attr(attribute) || '';
        try {
          const target = new URL(value, CAMPUS_ORIGIN);
          if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password) node.removeAttr(attribute);
        } catch {
          node.removeAttr(attribute);
        }
      }
    }
  });
  const descriptionHtml = $intro.length > 0 ? $intro.html() || '' : '';
  const descriptionMarkdown = descriptionHtml ? turndownService.turndown(descriptionHtml).trim() : 'Sin consigna de texto disponible.';

  // Archivos adjuntos a la consigna
  const attachments: Attachment[] = [];
  $intro.find('a[href*="pluginfile.php"]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href');
    const fileName = $a.text().trim();
    if (href && fileName) {
      try {
        attachments.push({
          name: fileName,
          url: resolveCampusUrl(href, CAMPUS_ORIGIN)
        });
      } catch {
        // Ignore malformed or out-of-scope file references in untrusted course HTML.
      }
    }
  });

  // Estado de entrega y fechas (tabla de sumario .submissionstatustable o .generaltable)
  let dueDate: string | undefined;
  let timeRemaining: string | undefined;
  let submissionStatus: string | undefined;
  let gradingStatus: string | undefined;
  let lastModified: string | undefined;

  $('table.generaltable tr, table.submissionstatustable tr').each((_, row) => {
    const $row = $(row);
    const label = $row.find('th, td.c0, td.label').first().text().trim().toLowerCase();
    const value = $row.find('td.c1, td:not(.c0):not(.label)').first().text().trim();

    if (label.includes('estado de la entrega') || label.includes('submission status')) {
      submissionStatus = value;
    } else if (label.includes('estado de la calificación') || label.includes('grading status')) {
      gradingStatus = value;
    } else if (label.includes('fecha de entrega') || label.includes('due date')) {
      dueDate = value;
    } else if (label.includes('tiempo restante') || label.includes('time remaining')) {
      timeRemaining = value;
    } else if (label.includes('última modificación') || label.includes('last modified')) {
      lastModified = value;
    }
  });

  return {
    id,
    name: name || 'Tarea sin título',
    courseName: courseName || undefined,
    descriptionHtml: descriptionHtml || undefined,
    descriptionMarkdown,
    descriptionStatus: descriptionHtml ? 'available' : 'not_provided',
    dueDate,
    timeRemaining,
    submissionStatus,
    gradingStatus,
    lastModified,
    attachments,
    url: pageUrl
  };
}
