import { campusClient } from '../client/campus-client.js';
import { rethrowTerminalCampusFailure } from '../client/campus-error-kind.js';
import { PATHS } from '../config.js';
import { parseCourseSections } from '../parsers/course-contents.js';
import type { CourseActivity, CourseSectionContent } from '../types/index.js';
import { normalizeText } from './course-match.js';
import { resolveCourse } from './course-ref.js';

const MAX_SECTION_FETCHES = 40;

export interface CourseContentsInput {
  course_id: string;
  section?: string;
  include_labels?: boolean;
}

export interface CourseContentsResult {
  courseId: string;
  courseName?: string;
  sections: Array<Omit<CourseSectionContent, 'rendered'>>;
  sectionCount: number;
  activityCount: number;
  warnings?: string[];
}

function sectionPath(courseId: string, number: number): string {
  return `${PATHS.courseView(courseId)}&section=${number}`;
}

const UNIT_WORDS = '(?:unidad|unit|tema|m[oó]dulo|clase|semana|bloque|cap[ií]tulo)';

/**
 * Elige secciones por número o por nombre. Un número suelto ("4") se interpreta primero como "Unidad 4"
 * (o Tema/Módulo/Semana 4) por el nombre de la sección, porque el número interno de Moodle casi nunca
 * coincide con el de la unidad (la sección 0 es "General"); si no hay un nombre así, se usa el número interno.
 */
export function selectSections(sections: CourseSectionContent[], selector: string): CourseSectionContent[] {
  const wanted = selector.trim();
  if (/^\d{1,4}$/.test(wanted)) {
    const asked = Number(wanted);
    const named = sections.filter(section => new RegExp(`\\b${UNIT_WORDS}\\s*0*${asked}(?!\\d)`, 'i').test(normalizeText(section.name)));
    if (named.length > 0) return named;
    const byNumber = sections.filter(section => section.number === asked);
    if (byNumber.length > 0) return byNumber;
  }
  const normalized = normalizeText(wanted);
  const byName = sections.filter(section => normalizeText(section.name).includes(normalized));
  if (byName.length > 0) return byName;
  const available = sections.map(section => `${section.number}: ${section.name}`).join('; ');
  throw new Error(`No hay una sección que coincida con "${wanted}". Secciones disponibles: ${available}.`);
}

/**
 * Árbol completo de un curso (secciones → actividades) en una sola herramienta. Funciona con los formatos
 * temas y semanas, y también con tiles, donde la página principal no trae el contenido de cada sección
 * y hay que pedirlo aparte (una solicitud por sección, respetando el ritmo del Campus).
 */
export async function handleGetCourseContents(input: CourseContentsInput): Promise<CourseContentsResult> {
  const course = await resolveCourse(input.course_id);
  const main = parseCourseSections(await campusClient.getHtml(PATHS.courseView(course.id)));
  const warnings: string[] = [];

  let sections = main.sections;
  if (input.section) sections = selectSections(sections, input.section);

  const pending = sections.filter(section => !section.rendered && section.number > 0);
  if (pending.length > MAX_SECTION_FETCHES) {
    warnings.push(`El curso tiene ${pending.length} secciones sin contenido cargado; se leyeron las primeras ${MAX_SECTION_FETCHES}.`);
  }
  for (const target of pending.slice(0, MAX_SECTION_FETCHES)) {
    try {
      const page = parseCourseSections(await campusClient.getHtml(sectionPath(course.id, target.number)));
      const loaded = page.sections.find(section => section.number === target.number) ?? page.sections[0];
      if (loaded) {
        target.activities = loaded.activities;
        target.summary = loaded.summary ?? target.summary;
        target.rendered = true;
      }
    } catch (error) {
      rethrowTerminalCampusFailure(error);
      warnings.push(`No se pudo leer la sección ${target.number} (${target.name}).`);
    }
  }

  const keepLabels = input.include_labels !== false;
  const output = sections.map(section => ({
    number: section.number,
    name: section.name,
    hidden: section.hidden,
    summary: section.summary,
    activities: keepLabels ? section.activities : section.activities.filter((activity: CourseActivity) => activity.type !== 'label')
  }));
  return {
    courseId: course.id,
    courseName: main.courseName ?? course.name,
    sections: output,
    sectionCount: output.length,
    activityCount: output.reduce((total, section) => total + section.activities.length, 0),
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
