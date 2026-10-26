import * as cheerio from 'cheerio';
import { CAMPUS_ORIGIN } from '../config.js';
import { parseCampusDate } from './campus-date.js';
import type { AssignmentSummary, QuizSummary } from '../types/index.js';

type IndexRow = { section?: string; href: string; name: string; cells: Record<string, string> };

function normalizeHeader(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function columnRole(header: string): string | undefined {
  const h = normalizeHeader(header);
  if (/^(mosaico|tema|semana|seccion|topic|week|section)\b/.test(h)) return 'section';
  if (/^(nombre|tareas?|cuestionarios?|name|assignment|quiz)\b/.test(h)) return 'name';
  if (/(fecha de entrega|cierra|cerrara|cierre|due|close)/.test(h)) return 'due';
  if (/(calificacion|nota|grade)/.test(h)) return 'grade';
  if (/(entrega|estado|status|submission)/.test(h)) return 'status';
  return undefined;
}

/**
 * Lee las tablas de /mod/assign/index.php y /mod/quiz/index.php asignando columnas por el texto del
 * encabezado (no por posición), porque Moodle cambia el orden y las columnas según la configuración.
 */
function parseIndexRows(html: string, modPath: string): IndexRow[] {
  const $ = cheerio.load(html);
  const rows: IndexRow[] = [];
  $('table.generaltable').each((_, table) => {
    const roles: (string | undefined)[] = $(table).find('thead th').map((__, th) => columnRole($(th).text())).get();
    let currentSection: string | undefined;
    $(table).find('tbody tr').each((__, tr) => {
      const $tr = $(tr);
      const cells = $tr.find('td');
      if (cells.length === 0) return;
      const record: Record<string, string> = {};
      cells.each((i, td) => {
        const role = roles[i];
        if (role) record[role] = $(td).text().replace(/\s+/g, ' ').trim();
      });
      if (record.section) currentSection = record.section;
      // Moodle puede enviar enlaces relativos ("view.php?id=1"): se resuelven contra el índice del módulo.
      const link = $tr.find('a[href]').filter((___, a) => {
        try {
          return new URL($(a).attr('href') || '', `${CAMPUS_ORIGIN}${modPath}/index.php`).pathname === `${modPath}/view.php`;
        } catch {
          return false;
        }
      }).first();
      const href = link.attr('href');
      if (!href) return;
      rows.push({
        section: record.section || currentSection,
        href,
        name: link.text().replace(/\s+/g, ' ').trim(),
        cells: record
      });
    });
  });
  return rows;
}

function viewUrl(href: string, modPath: string): { id: string; url: string } | undefined {
  try {
    const url = new URL(href, `${CAMPUS_ORIGIN}${modPath}/index.php`);
    const id = url.searchParams.get('id');
    if (!id || !/^\d+$/.test(id) || url.origin !== CAMPUS_ORIGIN) return undefined;
    return { id, url: url.href };
  } catch {
    return undefined;
  }
}

export type AssignmentRow = AssignmentSummary & { section?: string; dueDateIso?: string };

export function parseAssignmentRows(html: string): AssignmentRow[] {
  const result: AssignmentRow[] = [];
  const seen = new Set<string>();
  for (const row of parseIndexRows(html, '/mod/assign')) {
    const target = viewUrl(row.href, '/mod/assign');
    if (!target || seen.has(target.id)) continue;
    seen.add(target.id);
    const due = row.cells.due || undefined;
    result.push({
      id: target.id,
      name: row.name,
      url: target.url,
      section: row.section,
      dueDate: due,
      dueDateIso: parseCampusDate(due),
      status: row.cells.status || undefined,
      grade: row.cells.grade && row.cells.grade !== '-' ? row.cells.grade : undefined
    });
  }
  return result;
}

export function parseQuizIndex(html: string): QuizSummary[] {
  const result: QuizSummary[] = [];
  const seen = new Set<string>();
  for (const row of parseIndexRows(html, '/mod/quiz')) {
    const target = viewUrl(row.href, '/mod/quiz');
    if (!target || seen.has(target.id)) continue;
    seen.add(target.id);
    const closes = row.cells.due || undefined;
    result.push({
      id: target.id,
      name: row.name,
      url: target.url,
      section: row.section,
      closes,
      closesIso: parseCampusDate(closes),
      grade: row.cells.grade || undefined
    });
  }
  return result;
}
