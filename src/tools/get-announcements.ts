import { campusClient } from '../client/campus-client.js';
import { rethrowTerminalCampusFailure } from '../client/campus-error-kind.js';
import { PATHS } from '../config.js';
import { parseCourseSections } from '../parsers/course-contents.js';
import { parseDiscussionPosts, parseForumDiscussions } from '../parsers/forums.js';
import type { Course, DiscussionItem } from '../types/index.js';
import { listCoursesCached, resolveCourse } from './course-ref.js';

const TIME_BUDGET_MS = 45_000;
const NEWS_FORUM_NAME = /^(avisos?|novedades|anuncios?|noticias|news|announcements?)\b/i;
const MAX_BODIES = 5;

export interface AnnouncementsInput {
  course_id?: string;
  limit?: number;
  since?: string;
  include_body?: boolean;
}

export interface Announcement extends Pick<DiscussionItem, 'id' | 'title' | 'author' | 'repliesCount' | 'url'> {
  course: { id: string; name?: string };
  postedIso?: string;
  posted?: string;
  lastPostIso?: string;
  bodyMarkdown?: string;
}

export interface AnnouncementsResult {
  announcements: Announcement[];
  count: number;
  coursesScanned: number;
  coursesWithoutAnnouncements?: string[];
  coursesPending?: string[];
  partial?: boolean;
  warnings?: string[];
}

function parseSince(since: string | undefined): number | undefined {
  if (!since) return undefined;
  const value = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(since) ? `${since}T00:00:00-03:00` : since);
  if (Number.isNaN(value)) throw new Error('since debe ser una fecha válida (por ejemplo 2026-10-01 o 2026-10-01T18:00:00-03:00).');
  return value;
}

/** Foro de novedades de un curso: el módulo "Avisos"/"Novedades" de la sección General. */
async function findNewsForumPath(courseId: string): Promise<string | undefined> {
  const html = await campusClient.getHtml(PATHS.courseView(courseId));
  const forums = parseCourseSections(html).sections.flatMap(section => section.activities).filter(activity => activity.type === 'forum');
  const news = forums.find(activity => NEWS_FORUM_NAME.test(activity.name)) ?? undefined;
  return news?.url ? new URL(news.url).pathname + new URL(news.url).search : undefined;
}

/** Avisos recientes del foro de novedades, de una materia o de todas, del más nuevo al más viejo. */
export async function handleGetAnnouncements(input: AnnouncementsInput = {}): Promise<AnnouncementsResult> {
  const limit = input.limit ?? 10;
  const since = parseSince(input.since);

  let courses: Array<{ id: string; name?: string }>;
  if (input.course_id) courses = [await resolveCourse(input.course_id)];
  else courses = (await listCoursesCached()).map((course: Course) => ({ id: course.id, name: course.name }));

  const warnings: string[] = [];
  const without: string[] = [];
  const all: Announcement[] = [];
  const started = Date.now();
  let scanned = 0;
  for (const course of courses) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    try {
      const forumPath = await findNewsForumPath(course.id);
      if (!forumPath) {
        without.push(course.name ?? course.id);
      } else {
        for (const discussion of parseForumDiscussions(await campusClient.getHtml(forumPath))) {
          const lastPost = discussion.lastPostDateIso ?? discussion.createdDateIso;
          if (since !== undefined && (!lastPost || Date.parse(lastPost) < since)) continue;
          all.push({
            id: discussion.id,
            title: discussion.title,
            author: discussion.author,
            repliesCount: discussion.repliesCount,
            url: discussion.url,
            course,
            posted: discussion.createdDate,
            postedIso: discussion.createdDateIso,
            lastPostIso: discussion.lastPostDateIso
          });
        }
      }
    } catch (error) {
      rethrowTerminalCampusFailure(error);
      warnings.push(`No se pudieron leer los avisos de ${course.name ?? course.id}.`);
    }
    scanned += 1;
  }
  const pending = courses.slice(scanned);

  const announcements = all
    .sort((a, b) => Date.parse(b.postedIso ?? b.lastPostIso ?? '') - Date.parse(a.postedIso ?? a.lastPostIso ?? ''))
    .slice(0, limit);

  if (input.include_body) {
    for (const item of announcements.slice(0, MAX_BODIES)) {
      try {
        const posts = parseDiscussionPosts(await campusClient.getHtml(PATHS.forumDiscuss(item.id)));
        item.bodyMarkdown = posts[0]?.messageMarkdown || undefined;
      } catch (error) {
        rethrowTerminalCampusFailure(error);
        warnings.push(`No se pudo leer el texto del aviso "${item.title}".`);
      }
    }
    if (announcements.length > MAX_BODIES) warnings.push(`Se incluyó el texto de los ${MAX_BODIES} avisos más nuevos; usá get_discussion_posts para el resto.`);
  }

  return {
    announcements,
    count: announcements.length,
    coursesScanned: scanned,
    coursesWithoutAnnouncements: without.length > 0 ? without : undefined,
    coursesPending: pending.length > 0 ? pending.map(course => course.name ?? course.id) : undefined,
    partial: pending.length > 0 || undefined,
    warnings: warnings.length > 0 ? warnings : undefined
  };
}
