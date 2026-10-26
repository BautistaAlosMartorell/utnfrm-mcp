import * as cheerio from 'cheerio';
import { parseCampusDate } from './campus-date.js';
import type { QuizAttempt, QuizDetail } from '../types/index.js';

function clean(text: string | undefined): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function norm(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try {
    return new URL(href, base).href;
  } catch {
    return undefined;
  }
}

function attemptFromPairs(number: number | undefined, pairs: Record<string, string>, reviewUrl?: string): QuizAttempt {
  const started = pairs.comenzado || pairs.iniciado || pairs.started;
  const completed = pairs.completado || pairs.finalizado || pairs.enviado || pairs.completed;
  return {
    number,
    state: pairs.estado || pairs.state,
    started,
    startedIso: parseCampusDate(started),
    completed,
    completedIso: parseCampusDate(completed),
    duration: pairs.duracion || pairs.duration,
    points: pairs.puntos || pairs.marks,
    grade: pairs.calificacion || pairs.grade,
    reviewUrl
  };
}

/** Interpreta /mod/quiz/view.php: reglas del cuestionario, nota final e historial de intentos. */
export function parseQuizView(html: string, url: string): QuizDetail {
  const $ = cheerio.load(html);
  const idFromUrl = (() => {
    try {
      return new URL(url).searchParams.get('id') || '';
    } catch {
      return '';
    }
  })();

  const name = clean($('#page-header h1, .page-header-headings h1').first().text()) ||
    clean($('h1').first().text()) ||
    clean($('title').text().split('|')[0]);

  const notes: string[] = [];
  const infoLines: string[] = [];
  $('.quizinfo p, .quizinfo li, .quizinfo div').each((_, el) => {
    if ($(el).find('p, li, div').length > 0) return;
    const text = clean($(el).text());
    if (text && !infoLines.includes(text)) infoLines.push(text);
  });
  const fieldAfter = (pattern: RegExp): string | undefined => {
    for (const line of infoLines) {
      const match = line.match(pattern);
      if (match?.[1]) return clean(match[1]).replace(/[.]$/, '');
    }
    return undefined;
  };

  const gradingMethod = fieldAfter(/m[eé]todo de calificaci[oó]n\s*:\s*(.+)/i);
  const attemptsAllowed = fieldAfter(/intentos permitidos\s*:\s*(.+)/i);
  const timeLimit = fieldAfter(/l[ií]mite de tiempo\s*:\s*(.+)/i);
  const passingGrade = fieldAfter(/calificaci[oó]n para aprobar\s*:\s*(.+)/i);
  const opens = fieldAfter(/se abri(?:r[aá]|[oó])\s+el\s+(.+)/i) || fieldAfter(/abre(?:\s+el)?\s*:\s*(.+)/i);
  const closes = fieldAfter(/se cerr(?:ar[aá]|[oó])\s+el\s+(.+)/i) || fieldAfter(/cierra(?:\s+el)?\s*:\s*(.+)/i);
  for (const line of infoLines) {
    if (![gradingMethod, attemptsAllowed, timeLimit, passingGrade, opens, closes].some(value => value && line.includes(value))) {
      notes.push(line);
    }
  }

  const feedback = clean($('#feedback h3, #feedback').first().text());
  const bestGrade = feedback.replace(/\.$/, '') || undefined;
  for (const extra of $('.quizattempt, .quizattemptcounts').toArray().map(el => clean($(el).text())).filter(Boolean)) {
    if (!notes.includes(extra)) notes.push(extra);
  }

  const attempts: QuizAttempt[] = [];
  $('table.quizreviewsummary').each((_, table) => {
    const pairs: Record<string, string> = {};
    $(table).find('tr').each((__, tr) => {
      const key = norm($(tr).find('th').first().text());
      const value = clean($(tr).find('td').first().text());
      if (key) pairs[key] = value;
    });
    const card = $(table).closest('.card, li');
    const number = Number(clean(card.find('.card-title, h4').first().text()).match(/(\d+)/)?.[1]) || undefined;
    attempts.push(attemptFromPairs(number, pairs, absolute(card.find('a[href*="review.php"]').first().attr('href'), url)));
  });
  if (attempts.length === 0) {
    $('table.quizattemptsummary').each((_, table) => {
      const headers = $(table).find('thead th').map((__, th) => norm($(th).text())).get();
      $(table).find('tbody tr').each((__, tr) => {
        const pairs: Record<string, string> = {};
        $(tr).find('td, th').each((i, cell) => {
          if (headers[i]) pairs[headers[i]] = clean($(cell).text());
        });
        const number = Number(pairs.intento?.match(/(\d+)/)?.[1]) || undefined;
        attempts.push(attemptFromPairs(number, pairs, absolute($(tr).find('a[href*="review.php"]').first().attr('href'), url)));
      });
    });
  }

  return {
    id: idFromUrl,
    name,
    url,
    gradingMethod,
    attemptsAllowed,
    timeLimit,
    opens,
    opensIso: parseCampusDate(opens),
    closes,
    closesIso: parseCampusDate(closes),
    passingGrade,
    bestGrade,
    canStartAttempt: $('form[action*="startattempt.php"], form[action*="attempt.php"]').length > 0,
    attempts,
    notes
  };
}
