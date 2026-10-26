import { describe, expect, it } from 'vitest';
import { parseAssignmentRows, parseQuizIndex } from '../src/parsers/index-tables.js';
import { isSubmittedStatus } from '../src/tools/get-deadlines.js';

const assignIndex = `<table class="generaltable"><thead><tr><th>Mosaico</th><th>Tareas</th><th>Fecha de entrega</th><th>Entrega</th><th>Calificación</th></tr></thead><tbody>
<tr><td>Unidad 1</td><td><a href="https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=53217">Entrega TP1</a></td><td>miércoles, 2 de septiembre de 2026, 23:59</td><td>Enviado para calificar</td><td>88,00</td></tr>
<tr><td colspan="5"><div class="tabledivider"></div></td></tr>
<tr><td></td><td><a href="view.php?id=53218">Entrega TP2</a></td><td>domingo, 1 de noviembre de 2026, 23:59</td><td>No entregado</td><td>-</td></tr>
</tbody></table>`;

const quizIndex = `<table class="generaltable"><thead><tr><th>Mosaico</th><th>Nombre</th><th>El cuestionario se cerrará el</th><th>Calificación</th></tr></thead><tbody>
<tr><td>Unidad 1</td><td><a href="view.php?id=55667">Autoevaluación 1</a></td><td>Sin fecha de cierre</td><td>8,82/10,00</td></tr>
<tr><td></td><td><a href="view.php?id=55668">Parcial práctico</a></td><td>viernes, 30 de octubre de 2026, 23:59</td><td></td></tr>
</tbody></table>`;

describe('index tables', () => {
  it('maps assignment columns by header, resolves relative links and carries the section down', () => {
    expect(parseAssignmentRows(assignIndex)).toEqual([
      {
        id: '53217', name: 'Entrega TP1', url: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=53217', section: 'Unidad 1',
        dueDate: 'miércoles, 2 de septiembre de 2026, 23:59', dueDateIso: '2026-09-02T23:59:00-03:00',
        status: 'Enviado para calificar', grade: '88,00'
      },
      {
        id: '53218', name: 'Entrega TP2', url: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=53218', section: 'Unidad 1',
        dueDate: 'domingo, 1 de noviembre de 2026, 23:59', dueDateIso: '2026-11-01T23:59:00-03:00',
        status: 'No entregado', grade: undefined
      }
    ]);
  });

  it('parses quizzes with relative links, optional close dates and grades', () => {
    const quizzes = parseQuizIndex(quizIndex);
    expect(quizzes).toHaveLength(2);
    expect(quizzes[0]).toMatchObject({ id: '55667', closesIso: undefined, grade: '8,82/10,00', section: 'Unidad 1' });
    expect(quizzes[1]).toMatchObject({ id: '55668', closesIso: '2026-10-30T23:59:00-03:00', grade: undefined });
    expect(quizzes[1].url).toBe('https://campusvirtual.frm.utn.edu.ar/mod/quiz/view.php?id=55668');
  });

  it('does not treat "No entregado" as submitted', () => {
    expect(isSubmittedStatus('No entregado')).toBe(false);
    expect(isSubmittedStatus('Sin entrega')).toBe(false);
    expect(isSubmittedStatus('Borrador (no enviado)')).toBe(false);
    expect(isSubmittedStatus('Enviado para calificar')).toBe(true);
    expect(isSubmittedStatus('Calificado')).toBe(true);
    expect(isSubmittedStatus(undefined)).toBe(false);
  });
});
