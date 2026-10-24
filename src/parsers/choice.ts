import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { ChoiceDetail, ChoiceOption } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';

const turndown = new TurndownService();

/**
 * Parsea una consulta / elección de grupos en Moodle (/mod/choice/view.php?id=...)
 */
export function parseChoiceDetail(html: string, url: string): ChoiceDetail {
  const $ = cheerio.load(html);

  // ID del módulo
  const match = url.match(/[?&]id=(\d+)/);
  const id = match ? match[1] : '';

  // Nombre
  let name = $('.page-header-headings h1, .page-header-headings h2, h2').first().text().trim();
  if (!name) name = 'Elección / Consulta';

  // Consigna / Descripción
  const descEl = $('.activity-description, .choice-description, #intro').first();
  const descriptionMarkdown = descEl.length > 0 ? turndown.turndown(descEl.html() || '').trim() : '';

  // Opciones disponibles
  const options: ChoiceOption[] = [];
  $('input[type="radio"][name="answer"], input[type="checkbox"][name^="answer"], .choicesform input[type="radio"]').each((_, el) => {
    const $input = $(el);
    const optId = $input.attr('value') || '';
    if (!optId) return;

    const isSelected = $input.is(':checked');

    // Buscar la etiqueta del label
    const inputId = $input.attr('id');
    let labelText = '';
    if (inputId) {
      labelText = $(`label[for="${inputId}"]`).text().trim();
    }
    if (!labelText) {
      labelText = $input.closest('label').text().trim() || $input.parent().text().trim();
    }

    options.push({
      id: optId,
      text: labelText || `Opción ${optId}`,
      selected: isSelected
    });
  });

  // Si no había formulario de entrada pero hay tabla de respuestas (ej: si ya votó y muestra resultados)
  const hasAnswered = options.some(o => o.selected) || html.includes('Su elección:') || html.includes('Ha respondido');
  const canChangeAnswer = $('input[type="submit"][name="save"], button[type="submit"]').length > 0;

  return {
    id,
    name,
    descriptionMarkdown,
    options,
    hasAnswered,
    canChangeAnswer,
    url: new URL(url, CAMPUS_ORIGIN).href
  };
}
