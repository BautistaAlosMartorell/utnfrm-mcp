import { campusClient } from '../client/campus-client.js';
import { rethrowTerminalCampusFailure } from '../client/campus-error-kind.js';
import { findPluginfileCandidates } from '../client/campus-links.js';
import { extractFileContent } from '../parsers/file-extractor.js';
import { parseNavigationPage } from '../parsers/navigation.js';
import type { CourseActivity, ExtractedFileContent } from '../types/index.js';
import { handleGetCourseContents, type CourseContentsResult } from './get-course-contents.js';
import { handleReadExternal, type ExternalResult } from './read-external.js';

/** Presupuestos: cada archivo cuesta dos consultas al Campus (una por segundo) y el resultado tiene que caber en el contexto del modelo. */
const TIME_BUDGET_MS = 55_000;
const DEFAULT_MAX_CHARS_PER_SOURCE = 60_000;
const DEFAULT_MAX_TOTAL_CHARS = 200_000;
const MAX_OUTLINE_TOPICS = 400;
const READABLE_TYPES = new Set(['resource', 'folder', 'page', 'external_url']);

export interface StudyPackInput {
  course_id: string;
  unit: string;
  include_content?: boolean;
  include_external?: boolean;
  max_chars_per_source?: number;
  max_total_chars?: number;
}

export type SourceStatus = 'complete' | 'partial' | 'unreadable' | 'skipped';

export interface StudySource {
  id: string;
  title: string;
  type: string;
  campusUrl?: string;
  filename?: string;
  status: SourceStatus;
  pages?: number;
  characters: number;
  truncated: boolean;
  warnings: string[];
  /** Texto en Markdown; ausente con include_content: false o si el presupuesto total se agotó. */
  content?: string;
}

export interface OutlineTopic { source: string; page?: number; topic: string }

export interface StudyPackResult {
  course: { id: string; name?: string };
  unit: { number: number; name: string; summary?: string };
  sources: StudySource[];
  /** Temas de cada fuente con su página: sirve para citar y para verificar la cobertura del resumen. */
  outline: OutlineTopic[];
  notes: string[];
  coverage: { total: number; complete: number; partial: number; unreadable: number; skipped: number };
  totals: { characters: number; includedCharacters: number };
  partial?: boolean;
  warnings: string[];
  guidance: string;
}

export interface StudyPackDeps {
  contents: (courseId: string, unit: string) => Promise<CourseContentsResult>;
  download: (url: string) => Promise<{ buffer: Buffer; filename: string; contentType: string; finalUrl: string }>;
  getHtml: (url: string) => Promise<string>;
  readExternal: (url: string) => Promise<ExternalResult>;
  now: () => number;
}

const defaultDeps: StudyPackDeps = {
  contents: (courseId, unit) => handleGetCourseContents({ course_id: courseId, section: unit }),
  download: url => campusClient.downloadBuffer(url),
  getHtml: url => campusClient.getHtml(url),
  readExternal: url => handleReadExternal({ url }),
  now: () => Date.now()
};

function splitPages(content: string): Array<{ page: number; text: string }> {
  const parts = content.split(/^### Página (\d+) \/ \d+\s*$/m);
  const pages: Array<{ page: number; text: string }> = [];
  for (let i = 1; i < parts.length; i += 2) pages.push({ page: Number(parts[i]), text: (parts[i + 1] ?? '').replace(/\n---\s*$/m, '').trim() });
  return pages;
}

function cleanTopic(line: string): string {
  return line.replace(/^#+\s*/, '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Temas por página (diapositivas y apuntes en PDF): la primera línea con contenido de cada página, ignorando
 * encabezados y pies que se repiten en muchas páginas. Para texto sin páginas, los títulos Markdown.
 */
export function buildOutline(source: string, content: string): OutlineTopic[] {
  const pages = splitPages(content);
  if (pages.length === 0) {
    return content.split('\n').filter(line => /^#{1,3}\s+\S/.test(line)).slice(0, 80).map(line => ({ source, topic: cleanTopic(line) }));
  }
  const frequency = new Map<string, number>();
  for (const { text } of pages) {
    for (const line of new Set(text.split('\n').map(cleanTopic).filter(Boolean))) frequency.set(line, (frequency.get(line) ?? 0) + 1);
  }
  const repeatedFrom = pages.length >= 4 ? Math.max(3, Math.ceil(pages.length * 0.4)) : Infinity;
  const topics: OutlineTopic[] = [];
  for (const { page, text } of pages) {
    const lines = text.split('\n').map(cleanTopic).filter(Boolean);
    const topic = lines.find(line => (frequency.get(line) ?? 0) < repeatedFrom && !line.startsWith('|') && line.length >= 3 && line.length <= 140 && !/^\d+$/.test(line) && !/^(---|:?-{3,})/.test(line));
    if (topic && topics[topics.length - 1]?.topic !== topic) topics.push({ source, page, topic });
  }
  return topics;
}

function sourceFromExtraction(base: Pick<StudySource, 'id' | 'title' | 'type' | 'campusUrl'>, extracted: ExtractedFileContent): { source: StudySource; text: string } {
  const status: SourceStatus = extracted.extractionStatus === 'complete' ? 'complete'
    : extracted.extractionStatus === 'partial' ? 'partial'
    : 'unreadable';
  return {
    text: extracted.content,
    source: {
      ...base,
      filename: extracted.filename,
      status,
      pages: extracted.totalPages,
      characters: extracted.contentLength ?? extracted.content.length,
      truncated: extracted.truncated,
      warnings: extracted.extractionWarnings
    }
  };
}

type Pending = { source: StudySource; text: string };

async function readActivity(activity: CourseActivity, input: StudyPackInput, deps: StudyPackDeps): Promise<Pending[]> {
  const base = { id: activity.id, title: activity.name, type: activity.type, campusUrl: activity.url };
  const unreadable = (reason: string): Pending => ({
    text: '',
    source: { ...base, status: 'unreadable', characters: 0, truncated: false, warnings: [reason] }
  });

  if (!activity.url) return [unreadable('La actividad no tiene enlace.')];

  if (activity.type === 'resource') {
    const download = await deps.download(activity.url);
    const extracted = await extractFileContent(download.buffer, download.filename, download.contentType, download.finalUrl, { full: true, layout: true });
    return [sourceFromExtraction(base, extracted)];
  }

  if (activity.type === 'folder') {
    const html = await deps.getHtml(activity.url);
    const files = findPluginfileCandidates(html, activity.url).filter(file => /\/mod_folder\/content\//i.test(file.url));
    if (files.length === 0) return [unreadable('La carpeta no tiene archivos visibles.')];
    const results: Pending[] = [];
    for (const file of files) {
      const fileBase = { ...base, id: `${activity.id}:${file.name}`, title: `${activity.name} / ${file.name}`, campusUrl: file.url };
      try {
        const download = await deps.download(file.url);
        results.push(sourceFromExtraction(fileBase, await extractFileContent(download.buffer, download.filename, download.contentType, download.finalUrl, { full: true, layout: true })));
      } catch (error) {
        rethrowTerminalCampusFailure(error);
        results.push({ text: '', source: { ...fileBase, status: 'unreadable', characters: 0, truncated: false, warnings: ['No se pudo descargar el archivo.'] } });
      }
    }
    return results;
  }

  if (activity.type === 'page') {
    const html = await deps.getHtml(activity.url);
    const markdown = parseNavigationPage(html, activity.url).contentMarkdown ?? '';
    return [{
      text: markdown,
      source: { ...base, status: markdown.trim() ? 'complete' : 'unreadable', characters: markdown.length, truncated: false, warnings: markdown.trim() ? [] : ['La página no tiene texto.'] }
    }];
  }

  // Enlace externo (notebooks, repositorios): solo sitios permitidos.
  if (input.include_external === false) {
    return [{ text: '', source: { ...base, status: 'skipped', characters: 0, truncated: false, warnings: ['Enlace externo omitido (include_external: false). Usá read_external para leerlo.'] } }];
  }
  try {
    const external = await deps.readExternal(activity.url);
    return [{
      text: external.contentMarkdown,
      source: { ...base, filename: external.finalPath.split('/').pop(), status: external.truncated ? 'partial' : 'complete', characters: external.characters, truncated: external.truncated, warnings: external.truncated ? ['El contenido externo se truncó.'] : [] }
    }];
  } catch (error) {
    rethrowTerminalCampusFailure(error);
    return [unreadable(error instanceof Error ? error.message : 'No se pudo leer el enlace externo.')];
  }
}

/**
 * Junta todo el material de una unidad en una sola respuesta: lee cada archivo, página y enlace permitido,
 * arma el índice de temas con su página y resume el estado de lectura (qué se leyó completo y qué no).
 */
export async function handleStudyPack(input: StudyPackInput, deps: StudyPackDeps = defaultDeps): Promise<StudyPackResult> {
  const started = deps.now();
  const maxPerSource = input.max_chars_per_source ?? DEFAULT_MAX_CHARS_PER_SOURCE;
  const maxTotal = input.max_total_chars ?? DEFAULT_MAX_TOTAL_CHARS;
  const includeContent = input.include_content !== false;
  const contents = await deps.contents(input.course_id, input.unit);
  const warnings: string[] = [...(contents.warnings ?? [])];

  const sections = contents.sections;
  if (sections.length === 0) throw new Error(`No se encontró la unidad "${input.unit}" en la materia.`);
  const unit = sections[0];
  if (sections.length > 1) warnings.push(`"${input.unit}" coincide con ${sections.length} secciones (${sections.map(section => section.name).join('; ')}); se usó la primera. Indicá el nombre completo para elegir otra.`);

  const notes = unit.activities.filter(activity => activity.type === 'label' && activity.description).map(activity => activity.description!);
  const activities = unit.activities.filter(activity => READABLE_TYPES.has(activity.type));
  const skippedKinds = unit.activities.filter(activity => !READABLE_TYPES.has(activity.type) && activity.type !== 'label');

  const sources: StudySource[] = [];
  const outline: OutlineTopic[] = [];
  let included = 0;
  let total = 0;
  let timedOut = false;

  for (const activity of activities) {
    if (deps.now() - started > TIME_BUDGET_MS) {
      timedOut = true;
      sources.push({ id: activity.id, title: activity.name, type: activity.type, campusUrl: activity.url, status: 'skipped', characters: 0, truncated: false, warnings: ['No se alcanzó a leer por el presupuesto de tiempo: volvé a pedir la unidad o usá read_file con su enlace.'] });
      continue;
    }
    let pending: Pending[];
    try {
      pending = await readActivity(activity, input, deps);
    } catch (error) {
      rethrowTerminalCampusFailure(error);
      pending = [{ text: '', source: { id: activity.id, title: activity.name, type: activity.type, campusUrl: activity.url, status: 'unreadable', characters: 0, truncated: false, warnings: ['No se pudo leer esta fuente.'] } }];
    }
    for (const { source, text } of pending) {
      total += source.characters;
      if (outline.length < MAX_OUTLINE_TOPICS && text) outline.push(...buildOutline(source.title, text).slice(0, MAX_OUTLINE_TOPICS - outline.length));
      if (includeContent && text) {
        const room = Math.max(0, Math.min(maxPerSource, maxTotal - included));
        if (room === 0) {
          source.truncated = true;
          source.warnings = [...source.warnings, 'Sin espacio en el presupuesto total: pedí esta fuente sola con read_file.'];
        } else {
          source.content = text.length > room ? `${text.slice(0, room)}\n\n… [recortado: ${text.length - room} caracteres más; usá read_file con offset para el resto]` : text;
          if (text.length > room) {
            source.truncated = true;
            source.warnings = [...source.warnings, `Se incluyó el principio (${room} caracteres de ${text.length}).`];
          }
          included += Math.min(text.length, room);
        }
      }
      sources.push(source);
    }
  }

  for (const activity of skippedKinds) {
    sources.push({ id: activity.id, title: activity.name, type: activity.type, campusUrl: activity.url, status: 'skipped', characters: 0, truncated: false, warnings: [`Tipo "${activity.type}" no se lee como material de estudio.`] });
  }

  const count = (status: SourceStatus) => sources.filter(source => source.status === status).length;
  const result: StudyPackResult = {
    course: { id: contents.courseId, name: contents.courseName },
    unit: { number: unit.number, name: unit.name, summary: unit.summary },
    sources,
    outline,
    notes,
    coverage: { total: sources.length, complete: count('complete'), partial: count('partial'), unreadable: count('unreadable'), skipped: count('skipped') },
    totals: { characters: total, includedCharacters: included },
    partial: timedOut || undefined,
    warnings,
    guidance: 'Armá el resumen solo con estas fuentes. Revisá "outline" para no omitir temas, citá (archivo, p. N) y avisá qué fuentes figuran como partial, unreadable o skipped.'
  };
  return result;
}
