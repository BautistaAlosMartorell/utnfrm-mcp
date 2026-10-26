import { campusClient } from '../client/campus-client.js';
import { resolveCampusUrl } from '../client/campus-url.js';
import { requireMoodleId } from '../client/moodle-id.js';
import { parseQuizIndex } from '../parsers/index-tables.js';
import { parseQuizView } from '../parsers/quiz.js';
import type { QuizDetail, QuizSummary } from '../types/index.js';
import { resolveCourse } from './course-ref.js';

export interface QuizInfoInput {
  quiz_id?: string;
  course_id?: string;
}

export type QuizInfoResult =
  | { mode: 'quiz'; quiz: QuizDetail }
  | { mode: 'course'; courseId: string; quizzes: QuizSummary[]; count: number };

function quizViewPath(quizIdOrUrl: string): string {
  const candidate = quizIdOrUrl.trim();
  if (/^\d{1,12}$/.test(candidate)) return `/mod/quiz/view.php?id=${candidate}`;
  const url = new URL(resolveCampusUrl(candidate));
  if (url.pathname !== '/mod/quiz/view.php') throw new Error('Se esperaba un ID de cuestionario o una URL de /mod/quiz/view.php del Campus.');
  return `/mod/quiz/view.php?id=${requireMoodleId(candidate)}`;
}

/**
 * Con `quiz_id`: reglas, nota e intentos de un cuestionario. Con `course_id`: todos los cuestionarios de la
 * materia con fecha de cierre y nota. Solo lectura: nunca inicia ni envía un intento.
 */
export async function handleGetQuizInfo(input: QuizInfoInput): Promise<QuizInfoResult> {
  if (input.quiz_id && input.course_id) throw new Error('Indicá quiz_id o course_id, no ambos.');
  if (!input.quiz_id && !input.course_id) throw new Error('Indicá quiz_id (detalle de un cuestionario) o course_id (todos los de la materia).');

  if (input.quiz_id) {
    const path = quizViewPath(input.quiz_id);
    const html = await campusClient.getHtml(path);
    return { mode: 'quiz', quiz: parseQuizView(html, new URL(path, resolveCampusUrl('/')).href) };
  }

  const course = await resolveCourse(input.course_id!);
  const quizzes = parseQuizIndex(await campusClient.getHtml(`/mod/quiz/index.php?id=${course.id}`));
  return { mode: 'course', courseId: course.id, quizzes, count: quizzes.length };
}
