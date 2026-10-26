import * as cheerio from 'cheerio';
import { CAMPUS_ORIGIN } from '../config.js';
import type { CourseActivity, CourseSectionContent } from '../types/index.js';

const MODNAME_TYPES: Record<string, string> = {
  assign: 'assignment',
  url: 'external_url',
  data: 'database',
  lti: 'external_tool',
  bigbluebuttonbn: 'meeting'
};

const MAX_TEXT = 1500;

function clean(text: string | undefined, max = MAX_TEXT): string {
  return (text || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function absoluteCampusUrl(href: string | undefined): string | undefined {
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return undefined;
  try {
    const url = new URL(href, CAMPUS_ORIGIN);
    return url.origin === CAMPUS_ORIGIN && url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function sectionNumber($: cheerio.CheerioAPI, el: Parameters<cheerio.CheerioAPI>[0]): number | undefined {
  const $el = $(el);
  const candidates = [$el.attr('data-number'), $el.attr('data-section'), $el.attr('id')?.replace(/^section-/, '')];
  for (const candidate of candidates) {
    if (candidate !== undefined && /^\d{1,4}$/.test(candidate.trim())) return Number(candidate.trim());
  }
  return undefined;
}

function parseActivity($: cheerio.CheerioAPI, el: Parameters<cheerio.CheerioAPI>[0]): CourseActivity | undefined {
  const $act = $(el);
  const classes = $act.attr('class') || '';
  const modname = classes.match(/\bmodtype_([a-z0-9_]+)/i)?.[1]?.toLowerCase() || 'other';
  const link = $act.find('a.aalink[href*="/mod/"], a[href*="/mod/"]').first();
  const url = absoluteCampusUrl(link.attr('href'));

  const id = $act.attr('data-id') ||
    $act.attr('id')?.replace(/^module-/, '') ||
    classes.match(/\bmodule-(\d+)/)?.[1] ||
    url?.match(/[?&]id=(\d+)/)?.[1] ||
    '';

  let name = $act.find('[data-activityname]').first().attr('data-activityname') ||
    $act.attr('data-activityname') || '';
  if (!name) {
    const instance = link.find('.instancename').first().clone();
    instance.find('.accesshide, .sr-only').remove();
    name = clean(instance.text()) || clean(link.clone().find('.accesshide, .sr-only').remove().end().text());
  }
  name = clean(name, 300);

  const type = modname === 'label' ? 'label' : MODNAME_TYPES[modname] || modname;
  let description: string | undefined;
  if (modname === 'label') {
    const body = $act.find('.activity-altcontent, .contentwithoutlink, .no-overflow').first();
    description = clean(body.text()) || undefined;
    if (!name) name = clean(description, 80);
  } else {
    description = clean($act.find('.activity-description, .contentafterlink, .description').first().text()) || undefined;
  }
  if (!name && !url) return undefined;

  const manual = $act.find('[data-toggletype]').first().attr('data-toggletype');
  const completionText = clean($act.find('[data-region="completion-info"]').first().text(), 80);
  let completion: CourseActivity['completion'];
  if (manual === 'manual:undo' || /^(hecho|completado|done)\b/i.test(completionText)) completion = 'done';
  else if (manual === 'manual:mark-done' || /^(marcar como hecha|hacer|to do)\b/i.test(completionText)) completion = 'pending';

  const hidden = /\bdimmed\b/.test(classes) || $act.find('.badge').toArray()
    .some(badge => /^(oculto|hidden)/i.test(clean($(badge).text(), 40)));

  return {
    id,
    name,
    type,
    modname,
    url,
    description,
    completion,
    hidden: hidden || undefined
  };
}

export type ParsedCourseSections = {
  courseName?: string;
  sections: CourseSectionContent[];
};

/**
 * Lee las secciones de un curso de Moodle (formatos temas, semanas y tiles).
 * En el formato tiles la página principal solo trae la sección General con contenido: las demás vienen
 * vacías (`rendered: false`) y su contenido se obtiene abriendo `/course/view.php?id=…&section=N`.
 */
export function parseCourseSections(html: string): ParsedCourseSections {
  const $ = cheerio.load(html);
  const tileTitles = new Map<number, string>();
  $('li.tile[data-section], .tile[data-section]').each((_, el) => {
    const number = sectionNumber($, el);
    const title = clean($(el).find('.tile-text, .tile-textinner, a.tile-link').first().text() || $(el).text(), 200);
    if (number !== undefined && title && !tileTitles.has(number)) tileTitles.set(number, title);
  });

  const pageTitle = clean($('#page-header h2, .page-header-headings h2').first().text(), 200);
  const byNumber = new Map<number, CourseSectionContent>();

  $('li.section[id^="section-"], .course-section[data-section], .course-section[id^="section-"]').each((_, el) => {
    const number = sectionNumber($, el);
    if (number === undefined) return;
    const $sec = $(el);
    const classes = $sec.attr('class') || '';

    const heading = $sec.find('.sectionname, .sectiontitle h2, h3.section-title').first();
    const headingText = heading.clone();
    headingText.find('.sr-only, .accesshide, button').remove();
    let name = clean(headingText.text(), 200);
    if (!name) name = tileTitles.get(number) || '';
    if (!name && number === 0) name = 'General';
    if (!name) name = `Sección ${number}`;

    const summary = clean($sec.find('.summarytext, .section-summary, .summary').first().text()) || undefined;
    const activities: CourseActivity[] = [];
    $sec.find('.activity').each((__, actEl) => {
      if ($(actEl).parents('.activity').length > 0) return;
      const activity = parseActivity($, actEl);
      if (activity) activities.push(activity);
    });

    const rendered = activities.length > 0 || Boolean(heading.length) || Boolean(summary) || clean($sec.text(), 20).length > 0;
    const section: CourseSectionContent = {
      number,
      name,
      hidden: /\bhidden\b|\bdimmed\b/.test(classes) || undefined,
      summary,
      rendered,
      activities
    };
    const previous = byNumber.get(number);
    if (!previous || section.activities.length > previous.activities.length || (!previous.rendered && section.rendered)) {
      byNumber.set(number, section);
    }
  });

  const sections = [...byNumber.values()].sort((a, b) => a.number - b.number);
  // En una página de una sola sección (tiles), el h2 de la página es el nombre corto de la sección.
  if (sections.length === 1 && pageTitle && sections[0].name.startsWith('Sección ')) sections[0].name = pageTitle;

  const courseName = clean(
    $('#page-header h1, .page-header-headings h1').first().text() || $('title').text().split('|')[0].replace(/^Curso:\s*/i, ''),
    200
  ) || undefined;
  return { courseName, sections };
}
