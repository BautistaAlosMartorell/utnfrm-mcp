import * as cheerio from 'cheerio';
import { Course } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';

export function hasExplicitEmptyCoursesMessage(html: string): boolean {
  const text = cheerio.load(html).text().replace(/\s+/g, ' ').trim();
  return /\b(?:no hay cursos|no tienes cursos|no est[aá]s matriculad[oa] en (?:ning[uú]n|ninguna) curso|no courses (?:available|found)|you are not enrolled in any courses)\b/i.test(text);
}

export function parseCourses(html: string): Course[] {
  const $ = cheerio.load(html);
  const coursesMap = new Map<string, Course>();

  // 1. Buscar en tarjetas de dashboard y cajas de curso de Moodle (Boost / Classic / Moodle 3 y 4)
  // En Moodle 4/Boost: div.coursebox, div.dashboard-card, [data-region="course-content"], .coursename
  $('a[href*="/course/view.php"]').each((_, el) => {
    const $a = $(el);
    const href = $a.attr('href');
    if (!href) return;

    try {
      const url = new URL(href, CAMPUS_ORIGIN);
      if (url.origin !== CAMPUS_ORIGIN || url.protocol !== 'https:' || url.username || url.password) return;
      const id = url.searchParams.get('id');
      if (!id || !/^\d+$/.test(id)) return;

      // Descartar enlaces irrelevantes que tengan id=1 (sitio general) si se desea, o mantener si es curso válido
      if (id === '1') return;

      // Buscar el nombre del curso
      let name = '';

      // Remover elementos visualmente ocultos para lectores de pantalla
      $a.find('.sr-only, .accesshide').remove();

      // Si el enlace está dentro de un elemento con clase coursename o dashboard-card
      const $card = $a.closest('.coursebox, .dashboard-card, .course-info-container, [data-course-id]');
      if ($card.length > 0) {
        const titleEl = $card.find('.coursename, .course-title, .dashboard-card-title, h3, h4').first();
        if (titleEl.length > 0) {
          titleEl.find('.sr-only, .accesshide').remove();
          name = titleEl.text().trim();
        }
      }

      // Si aún no hay nombre, buscar en el texto directo del enlace
      if (!name) {
        name = $a.text().trim();
      }

      // Limpiar texto (remover etiquetas de estado de Moodle Boost o accesibilidad)
      name = name
        .replace(/\s+/g, ' ')
        .replace(/^El curso es destacado\s*/i, '')
        .replace(/^Nombre del curso\s*/i, '')
        .replace(/^Curso\s*:\s*/i, '')
        .trim();

      // Si el nombre quedó duplicado como "Materia Materia", deduplicar
      const halfLen = Math.floor(name.length / 2);
      if (name.length > 6 && name.slice(0, halfLen).trim() === name.slice(halfLen).trim()) {
        name = name.slice(0, halfLen).trim();
      }

      // Si el enlace era solo un icono o texto irrelevante ("Ver", "Acceder"), evitar pisar si ya teníamos un nombre mejor
      const isGeneric = /^(acceder|entrar|ver|abrir|ir al curso|course|view)$/i.test(name);
      if (name && !isGeneric) {
        if (!coursesMap.has(id) || coursesMap.get(id)!.name.length < name.length) {
          coursesMap.set(id, {
            id,
            name,
            url: url.href
          });
        }
      }
    } catch {
      // Ignorar URLs malformadas
    }
  });

  // Retornar la lista ordenada por ID numérico o nombre
  return Array.from(coursesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}
