import { campusClient } from '../client/campus-client.js';
import { rethrowTerminalCampusFailure } from '../client/campus-error-kind.js';
import { PATHS } from '../config.js';
import { daysUntil } from '../parsers/campus-date.js';
import { parseAssignmentRows, parseQuizIndex } from '../parsers/index-tables.js';
import { resolveCourse } from './course-ref.js';
import { scopeCourses } from './active-courses.js';

/** Presupuesto de tiempo: los clientes MCP suelen cortar a los ~60 s y el Campus se consulta de a una solicitud por segundo. */
const TIME_BUDGET_MS = 40_000;
const DEFAULT_OVERDUE_DAYS = 14;
const NOT_SUBMITTED_STATUS = /\b(?:no entregad|sin entrega|no enviad|borrador|no se ha|not submitted|no submission|draft)/i;
const SUBMITTED_STATUS = /enviad[oa] para calificar|entregad[oa]|submitted|calificad[oa]|graded/i;

/** "No entregado" contiene "entregado": se descartan primero los estados negativos. */
export function isSubmittedStatus(status: string | undefined): boolean {
  if (!status) return false;
  const normalized = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return !NOT_SUBMITTED_STATUS.test(normalized) && SUBMITTED_STATUS.test(normalized);
}

export interface DeadlinesInput {
  course_id?: string;
  days_ahead?: number;
  include_completed?: boolean;
  include_overdue?: boolean;
  overdue_days?: number;
  all_courses?: boolean;
}

export interface Deadline {
  course: { id: string; name?: string };
  kind: 'assignment' | 'quiz';
  name: string;
  url: string;
  section?: string;
  due: string;
  dueIso: string;
  daysLeft?: number;
  status: 'pending' | 'overdue' | 'completed';
  submissionStatus?: string;
  grade?: string;
}

export interface DeadlinesResult {
  generatedAt: string;
  timezone: string;
  windowDays: number;
  /** 'perfil' si se revisaron solo las materias del cuatrimestre; 'todas' en otro caso. */
  scope: 'perfil' | 'todas' | 'materia';
  deadlines: Deadline[];
  count: number;
  coursesScanned: number;
  coursesPending?: string[];
  partial?: boolean;
  warnings?: string[];
}

/** Un índice que falla no se confunde con "sin entregas": se informa como advertencia y se sigue con el otro. */
async function readIndex(path: string, label: string, course: { id: string; name?: string }, warnings: string[]): Promise<string> {
  try {
    return await campusClient.getHtml(path);
  } catch (error) {
    rethrowTerminalCampusFailure(error);
    warnings.push(`No se pudieron leer ${label} de ${course.name ?? course.id}.`);
    return '';
  }
}

async function scanCourse(course: { id: string; name?: string }, now: Date, warnings: string[]): Promise<Deadline[]> {
  const found: Deadline[] = [];
  const assignHtml = await readIndex(PATHS.assignIndex(course.id), 'las tareas', course, warnings);
  for (const row of parseAssignmentRows(assignHtml)) {
    if (!row.dueDateIso || !row.dueDate) continue;
    const completed = isSubmittedStatus(row.status) || Boolean(row.grade);
    found.push({
      course,
      kind: 'assignment',
      name: row.name,
      url: row.url,
      section: row.section,
      due: row.dueDate,
      dueIso: row.dueDateIso,
      daysLeft: daysUntil(row.dueDateIso, now),
      status: completed ? 'completed' : Date.parse(row.dueDateIso) < now.getTime() ? 'overdue' : 'pending',
      submissionStatus: row.status,
      grade: row.grade
    });
  }

  const quizHtml = await readIndex(`/mod/quiz/index.php?id=${course.id}`, 'los cuestionarios', course, warnings);
  for (const quiz of parseQuizIndex(quizHtml)) {
    if (!quiz.closesIso || !quiz.closes) continue;
    const completed = Boolean(quiz.grade);
    found.push({
      course,
      kind: 'quiz',
      name: quiz.name,
      url: quiz.url,
      section: quiz.section,
      due: quiz.closes,
      dueIso: quiz.closesIso,
      daysLeft: daysUntil(quiz.closesIso, now),
      status: completed ? 'completed' : Date.parse(quiz.closesIso) < now.getTime() ? 'overdue' : 'pending',
      grade: quiz.grade
    });
  }
  return found;
}

/**
 * Próximas entregas y cierres de cuestionarios, de una materia o de todas, ordenados por fecha.
 * Combina los índices de tareas y de cuestionarios de cada curso (con fecha y estado de entrega).
 */
export async function handleGetDeadlines(input: DeadlinesInput = {}): Promise<DeadlinesResult> {
  const now = new Date();
  const windowDays = input.days_ahead ?? 30;
  const includeCompleted = input.include_completed === true;
  const includeOverdue = input.include_overdue !== false;
  const horizon = now.getTime() + windowDays * 86_400_000;
  const overdueSince = now.getTime() - (input.overdue_days ?? DEFAULT_OVERDUE_DAYS) * 86_400_000;

  let courses: Array<{ id: string; name?: string }>;
  let scope: DeadlinesResult['scope'] = 'materia';
  const warnings: string[] = [];
  if (input.course_id) {
    courses = [await resolveCourse(input.course_id)];
  } else {
    const scoped = await scopeCourses(input.all_courses);
    courses = scoped.courses;
    scope = scoped.scope;
    if (scoped.warning) warnings.push(scoped.warning);
  }

  const collected: Deadline[] = [];
  const started = Date.now();
  let scanned = 0;
  for (const course of courses) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      collected.push(...await scanCourse(course, now, warnings));
    } catch (error) {
      rethrowTerminalCampusFailure(error);
      warnings.push(`No se pudo leer la materia ${course.name ?? course.id}.`);
    }
    scanned += 1;
  }
  const pending = courses.slice(scanned);
  if (pending.length > 0) warnings.push('Se alcanzó el presupuesto de tiempo: volvé a llamar con course_id para las materias pendientes.');

  const deadlines = collected
    .filter(item => {
      if (item.status === 'completed') return includeCompleted;
      if (item.status === 'overdue') return includeOverdue && Date.parse(item.dueIso) >= overdueSince;
      return Date.parse(item.dueIso) <= horizon;
    })
    .sort((a, b) => Date.parse(a.dueIso) - Date.parse(b.dueIso));

  return {
    generatedAt: now.toISOString(),
    timezone: 'America/Argentina/Mendoza (UTC-03:00)',
    windowDays,
    scope,
    deadlines,
    count: deadlines.length,
    coursesScanned: scanned,
    coursesPending: pending.length > 0 ? pending.map(course => course.name ?? course.id) : undefined,
    partial: pending.length > 0 || undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
