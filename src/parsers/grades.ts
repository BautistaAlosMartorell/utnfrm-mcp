import * as cheerio from 'cheerio';
import { CourseGradesReport, GradeItem } from '../types/index.js';

/**
 * Parsea el reporte del libro de calificaciones de una materia de Moodle (/grade/report/user/index.php?id=...)
 */
export function parseCourseGrades(html: string, courseId: string): CourseGradesReport {
  const $ = cheerio.load(html);

  // Obtener nombre del curso desde el encabezado o migas de pan
  let courseName = $('.page-header-headings h1, .page-header-headings h2').text().trim();
  if (!courseName) {
    courseName = $('title').text().replace(/Calificaciones|Campus|Usuario/gi, '').replace(/[|:-]/g, '').trim();
  }

  const items: GradeItem[] = [];
  let currentCategory = '';
  let courseTotal: string | undefined = undefined;

  $('table.user-grade tbody tr, table.gradestable tbody tr').each((_, el) => {
    const $row = $(el);

    // Detectar encabezado de categoría
    if ($row.hasClass('category') || $row.hasClass('categoryitem')) {
      const catText = $row.find('.column-itemname').text().trim();
      if (catText) {
        currentCategory = catText.replace(/^Categoría\s*:\s*/i, '');
      }
    }

    const itemCell = $row.find('.column-itemname, th.itemname, td.itemname');
    let itemName = itemCell.text().trim();

    // Limpiar iconos y prefijos como "Tarea" o "Cuestionario"
    itemName = itemName
      .replace(/^(Tarea|Cuestionario|Foro|Taller|Lección|Glosario)\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const grade = $row.find('.column-grade, td.grade').text().trim();
    const range = $row.find('.column-range, td.range').text().trim();
    const percentage = $row.find('.column-percentage, td.percentage').text().trim();
    const feedback = $row.find('.column-feedback, td.feedback').text().trim();
    const weight = $row.find('.column-weight, td.weight').text().trim();

    // Extraer ID del elemento si existe enlace en el item
    const itemHref = itemCell.find('a').attr('href');
    let id: string | undefined = undefined;
    if (itemHref) {
      const match = itemHref.match(/[?&]id=(\d+)/);
      if (match) id = match[1];
    }

    // Si es el total del curso
    if ($row.hasClass('courseitem') || itemName.toLowerCase().includes('total del curso')) {
      courseTotal = grade || percentage;
    }

    // Solo guardar filas que tengan nombre y algún dato relevante
    if (itemName && (grade || range || percentage || feedback)) {
      items.push({
        id,
        name: itemName,
        category: currentCategory || undefined,
        grade: grade || '-',
        range: range || undefined,
        percentage: percentage || undefined,
        feedback: feedback || undefined,
        weight: weight || undefined
      });
    }
  });

  return {
    courseId,
    courseName: courseName || `Curso ${courseId}`,
    items,
    courseTotal
  };
}
