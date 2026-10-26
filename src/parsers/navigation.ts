import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { NavigationResult, NavigationItem } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';
import { parseAssignmentDetail } from './assignments.js';
import { parseForumDiscussions, parseDiscussionPosts } from './forums.js';
import { parseChoiceDetail } from './choice.js';
import { parseQuizView } from './quiz.js';
import { findPluginfileCandidates } from '../client/campus-links.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-'
});

/**
 * Parsea e interpreta contextualmente cualquier página del Campus Virtual de Moodle
 * proporcionando navegación jerárquica unificada (curso, módulo, foro, discusión, tarea, etc.).
 */
export function parseNavigationPage(html: string, url: string): NavigationResult {
  const $ = cheerio.load(html);
  const targetUrl = url.startsWith('http') ? url : new URL(url, CAMPUS_ORIGIN).href;
  const parsedUrl = new URL(targetUrl);
  const pathname = parsedUrl.pathname;

  // 1. Migas de pan (Breadcrumbs)
  const breadcrumbs: string[] = [];
  $('nav[aria-label="breadcrumb"] li, .breadcrumb li').each((_, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text && text !== '/' && text !== '>') {
      breadcrumbs.push(text);
    }
  });

  // Título de la página
  let title = $('#page-header h1, #page-header h2, .page-header-headings h1, .page-header-headings h2, h2.main').first().text().trim();
  if (!title || /^(bloques|navegación|administración|menú)$/i.test(title)) {
    title = $('h1').not('.sr-only, .accesshide').first().text().trim();
  }
  if (!title) {
    title = $('title').text().replace(/\|.*$/g, '').trim();
  }

  // Enlace padre de navegación
  let parent: { name: string; url: string } | undefined = undefined;
  if (breadcrumbs.length > 1) {
    const parentBreadcrumb = $('nav[aria-label="breadcrumb"] li a, .breadcrumb li a').last();
    const parentHref = parentBreadcrumb.attr('href');
    const parentName = parentBreadcrumb.text().trim();
    if (parentHref && parentName) {
      parent = {
        name: parentName,
        url: new URL(parentHref, CAMPUS_ORIGIN).href
      };
    }
  }

  // 2. Determinar tipo de página según pathname

  // A. Discusión de Foro (/mod/forum/discuss.php)
  if (pathname.includes('/mod/forum/discuss.php')) {
    const posts = parseDiscussionPosts(html);
    const parentForumLink = $('a[href*="/mod/forum/view.php"]').first();
    if (parentForumLink.length > 0) {
      parent = {
        name: parentForumLink.text().trim() || 'Foro',
        url: new URL(parentForumLink.attr('href')!, CAMPUS_ORIGIN).href
      };
    }

    const firstPost = posts[0];
    const replies = posts.slice(1);

    let contentMd = `# ${firstPost?.subject || title}\n\n`;
    contentMd += `**Autor:** ${firstPost?.author || 'n/a'} (${firstPost?.date || ''})\n\n`;
    contentMd += `${firstPost?.messageMarkdown || ''}\n\n`;

    if (replies.length > 0) {
      contentMd += `## Respuestas (${replies.length})\n\n`;
      replies.forEach((r, idx) => {
        contentMd += `### Respuesta #${idx + 1} por ${r.author} [${r.date}]\n\n${r.messageMarkdown}\n\n---\n\n`;
      });
    }

    return {
      kind: 'discussion',
      title,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: `Discusión con ${posts.length} mensajes`,
      contentMarkdown: contentMd.trim(),
      children: []
    };
  }

  // B. Foro (/mod/forum/view.php)
  if (pathname.includes('/mod/forum/view.php')) {
    const discussions = parseForumDiscussions(html);
    const descEl = $('.activity-description, #intro, .forum-description').first();
    const descMd = descEl.length > 0 ? turndown.turndown(descEl.html() || '').trim() : '';

    const children: NavigationItem[] = discussions.map(d => ({
      id: d.id,
      name: d.title,
      type: 'discussion',
      url: d.url,
      detail: `Por ${d.author} (${d.repliesCount} respuestas)`
    }));

    return {
      kind: 'forum',
      title,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: `Foro con ${discussions.length} temas de discusión`,
      contentMarkdown: descMd || undefined,
      children
    };
  }

  // C. Tarea / Assignment (/mod/assign/view.php)
  if (pathname.includes('/mod/assign/view.php')) {
    const detail = parseAssignmentDetail(html, targetUrl);
    let md = `# ${detail.name}\n\n`;
    if (detail.dueDate) md += `**Fecha límite:** ${detail.dueDate}\n`;
    if (detail.timeRemaining) md += `**Tiempo restante:** ${detail.timeRemaining}\n`;
    if (detail.submissionStatus) md += `**Estado de entrega:** ${detail.submissionStatus}\n`;
    if (detail.gradingStatus) md += `**Estado de calificación:** ${detail.gradingStatus}\n`;
    md += `\n## Consigna\n\n${detail.descriptionMarkdown}\n`;

    const children: NavigationItem[] = detail.attachments.map(att => ({
      id: att.name,
      name: att.name,
      type: 'resource',
      url: att.url,
      detail: `Archivo adjunto docente (${att.size || 'n/a'})`
    }));

    return {
      kind: 'assignment',
      title: detail.name,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: `Tarea: ${detail.submissionStatus || 'Sin entrega'} - Vence: ${detail.dueDate || 'Sin fecha'}`,
      contentMarkdown: md,
      children,
      metadata: {
        dueDate: detail.dueDate,
        submissionStatus: detail.submissionStatus,
        gradingStatus: detail.gradingStatus,
        attachments: detail.attachments
      }
    };
  }

  // D. Consulta / Elección (/mod/choice/view.php)
  if (pathname.includes('/mod/choice/view.php')) {
    const choice = parseChoiceDetail(html, targetUrl);
    let md = `# ${choice.name}\n\n${choice.descriptionMarkdown}\n\n### Opciones Disponibles\n`;
    choice.options.forEach(opt => {
      md += `- [${opt.selected ? 'X' : ' '}] (ID: ${opt.id}) ${opt.text}\n`;
    });

    return {
      kind: 'choice',
      title: choice.name,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: `Elección con ${choice.options.length} opciones (${choice.hasAnswered ? 'Respondida' : 'Sin responder'})`,
      contentMarkdown: md,
      children: choice.options.map(o => ({
        id: o.id,
        name: o.text,
        type: 'choice',
        url: targetUrl,
        detail: o.selected ? 'Seleccionada' : 'Disponible'
      }))
    };
  }

  // E. Recurso / Archivo (/mod/resource/view.php)
  if (pathname.includes('/mod/resource/view.php')) {
    const pluginLink = $('a[href*="/pluginfile.php/"]').first().attr('href');
    const descEl = $('.activity-description, #intro').first();
    const descMd = descEl.length > 0 ? turndown.turndown(descEl.html() || '').trim() : '';

    return {
      kind: 'resource',
      title,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: 'Recurso / Archivo de estudio',
      contentMarkdown: descMd || undefined,
      children: pluginLink ? [{
        id: 'file',
        name: title,
        type: 'resource',
        url: new URL(pluginLink, CAMPUS_ORIGIN).href,
        detail: 'Archivo directo descargable'
      }] : []
    };
  }

  // E2. Carpeta (/mod/folder/view.php): lista sus archivos para poder leerlos de a uno con read_file
  if (pathname.includes('/mod/folder/view.php')) {
    const files = findPluginfileCandidates(html, targetUrl).filter(file => /\/mod_folder\/content\//i.test(file.url));
    return {
      kind: 'folder',
      title,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: `Carpeta con ${files.length} archivos`,
      children: files.map((file, index) => ({
        id: String(index + 1),
        name: file.name,
        type: 'resource',
        url: file.url,
        detail: 'Archivo de la carpeta'
      }))
    };
  }

  // E3. Cuestionario (/mod/quiz/view.php): reglas, nota e intentos (solo lectura)
  if (pathname.includes('/mod/quiz/view.php')) {
    const quiz = parseQuizView(html, targetUrl);
    const lines = [`# ${quiz.name || title}`];
    if (quiz.gradingMethod) lines.push(`**Método de calificación:** ${quiz.gradingMethod}`);
    if (quiz.attemptsAllowed) lines.push(`**Intentos permitidos:** ${quiz.attemptsAllowed}`);
    if (quiz.timeLimit) lines.push(`**Límite de tiempo:** ${quiz.timeLimit}`);
    if (quiz.opens) lines.push(`**Abre:** ${quiz.opens}`);
    if (quiz.closes) lines.push(`**Cierra:** ${quiz.closes}`);
    if (quiz.bestGrade) lines.push(`**${quiz.bestGrade}**`);
    for (const attempt of quiz.attempts) {
      lines.push(`- Intento ${attempt.number ?? '?'}: ${attempt.state ?? ''} · ${attempt.grade ?? 'sin nota'}`);
    }
    return {
      kind: 'quiz',
      title: quiz.name || title,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: `Cuestionario con ${quiz.attempts.length} intentos registrados`,
      contentMarkdown: lines.join('\n'),
      children: [],
      metadata: { ...quiz }
    };
  }

  // F. Página de Contenido (/mod/page/view.php)
  if (pathname.includes('/mod/page/view.php')) {
    const contentEl = $('.page-content, [role="main"]').first();
    contentEl.find('.page-header, .breadcrumb').remove();
    const pageMd = turndown.turndown(contentEl.html() || '').trim();

    return {
      kind: 'page',
      title,
      parent,
      breadcrumbs,
      url: targetUrl,
      summary: 'Página de lectura del curso',
      contentMarkdown: pageMd,
      children: []
    };
  }

  // G. Curso Principal o Sección (/course/view.php o /course/section.php)
  // Explora y extrae todas las secciones, módulos y actividades
  const children: NavigationItem[] = [];
  const sectionsFound: { id: string; name: string }[] = [];

  $('.course-content ul.topics > li, .course-content ul.weeks > li, li.section.main, section.course-section').each((_, secEl) => {
    const $sec = $(secEl);
    const secId = $sec.attr('id')?.replace(/^section-/, '') || String(_);
    const secName = $sec.find('.sectionname, .section-title, h3.sectionname, h3.section-title').first().text().trim() || `Sección ${secId}`;

    sectionsFound.push({ id: secId, name: secName });

    $sec.find('.activity').each((__, actEl) => {
      const $act = $(actEl);
      const link = $act.find('a[href*="/mod/"]').first();
      const href = link.attr('href');
      if (!href) return;

      const actTitle = link.find('.instancename').text().replace(/Recurso|Tarea|Foro|Archivo/gi, '').trim() || link.text().trim();
      const actClass = $act.attr('class') || '';

      let actType: NavigationItem['type'] = 'module';
      if (actClass.includes('modtype_assign') || href.includes('/mod/assign/')) actType = 'assignment';
      else if (actClass.includes('modtype_forum') || href.includes('/mod/forum/')) actType = 'forum';
      else if (actClass.includes('modtype_resource') || href.includes('/mod/resource/')) actType = 'resource';
      else if (actClass.includes('modtype_folder') || href.includes('/mod/folder/')) actType = 'folder';
      else if (actClass.includes('modtype_page') || href.includes('/mod/page/')) actType = 'page';
      else if (actClass.includes('modtype_choice') || href.includes('/mod/choice/')) actType = 'choice';
      else if (actClass.includes('modtype_quiz') || href.includes('/mod/quiz/')) actType = 'quiz';
      else if (actClass.includes('modtype_url') || href.includes('/mod/url/')) actType = 'external_url';

      const m = href.match(/[?&]id=(\d+)/);
      const actId = m ? m[1] : '';

      children.push({
        id: actId,
        name: actTitle,
        type: actType,
        url: new URL(href, CAMPUS_ORIGIN).href,
        detail: `[${secName}]`
      });
    });
  });

  return {
    kind: 'course',
    title,
    parent,
    breadcrumbs,
    url: targetUrl,
    summary: `Curso con ${sectionsFound.length} secciones y ${children.length} actividades`,
    children,
    metadata: {
      sections: sectionsFound,
      totalActivities: children.length
    }
  };
}
