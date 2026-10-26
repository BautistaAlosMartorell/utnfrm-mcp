import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseDiscussionPosts, parseForumDiscussions, parseForumsList } from '../src/parsers/forums.js';
import { parseQuizView } from '../src/parsers/quiz.js';

const fixture = (name: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');

describe('quiz view', () => {
  it('reads rules, best grade and attempt history', () => {
    const quiz = parseQuizView(fixture('quiz-attempt.html'), 'https://campusvirtual.frm.utn.edu.ar/mod/quiz/view.php?id=5');
    expect(quiz).toMatchObject({
      id: '5',
      name: 'Autoevaluación de Prueba',
      attemptsAllowed: '2',
      gradingMethod: 'Calificación más alta',
      timeLimit: '30 minutos',
      closes: 'viernes, 30 de octubre de 2026, 23:59',
      closesIso: '2026-10-30T23:59:00-03:00',
      bestGrade: 'Calificación más alta: 8,82 / 10,00',
      canStartAttempt: true
    });
    expect(quiz.attempts).toEqual([{
      number: 1,
      state: 'Finalizado',
      started: 'lunes, 14 de septiembre de 2026, 21:37',
      startedIso: '2026-09-14T21:37:00-03:00',
      completed: 'lunes, 14 de septiembre de 2026, 21:50',
      completedIso: '2026-09-14T21:50:00-03:00',
      duration: '13 minutos 1 segundos',
      points: '15,00/17,00',
      grade: '8,82 de 10,00 (88,24%)',
      reviewUrl: 'https://campusvirtual.frm.utn.edu.ar/mod/quiz/review.php?attempt=7&cmid=5'
    }]);
  });
});

describe('forum parsers on the Moodle 4 markup', () => {
  it('lists forums linked with relative URLs and instance ids', () => {
    const forums = parseForumsList(fixture('forum-index-relative.html'));
    expect(forums).toEqual([
      {
        id: '2106', name: 'Avisos', description: 'Todos los avisos. Saludos', discussionsCount: 9, unreadCount: undefined,
        url: 'https://campusvirtual.frm.utn.edu.ar/mod/forum/view.php?f=2106'
      },
      {
        id: '77', name: 'Foro de Dudas', description: undefined, discussionsCount: 0, unreadCount: undefined,
        url: 'https://campusvirtual.frm.utn.edu.ar/mod/forum/view.php?id=77'
      }
    ]);
  });

  it('reads discussion authors, replies and exact dates from data-timestamp', () => {
    const [discussion] = parseForumDiscussions(fixture('forum-moodle4.html'));
    expect(discussion).toMatchObject({
      id: '6410',
      title: 'Fecha del parcial',
      author: 'Docente Uno',
      createdDate: '21 oct 2026',
      createdDateIso: '2026-10-21T20:26:00-03:00',
      lastPostAuthor: 'Docente Dos',
      lastPostDate: 'mié, 21 de oct de 2026, 20:26',
      lastPostDateIso: '2026-10-21T20:26:00-03:00',
      repliesCount: 3
    });
  });

  it('reads posts with subject, author, ISO date and content without action links', () => {
    const [post] = parseDiscussionPosts(fixture('discuss-moodle4.html'));
    expect(post).toMatchObject({
      id: '10796',
      subject: 'Segundo Parcial',
      author: 'Docente Uno',
      dateIso: '2026-10-21T20:22:50-03:00'
    });
    expect(post.messageMarkdown).toContain('El parcial será el **martes 27/10 a las 16:00**.');
    expect(post.messageMarkdown).not.toContain('Enlace permanente');
  });
});
