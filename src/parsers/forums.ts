import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { ForumItem, DiscussionItem, ForumPostItem, Attachment } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';
import { epochToCampusIso } from './campus-date.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-'
});

const FORUM_INDEX_BASE = `${CAMPUS_ORIGIN}/mod/forum/index.php`;

/** Resuelve enlaces absolutos o relativos ("view.php?f=2106") a foros; devuelve su id y URL absoluta. */
function forumLink(href: string | undefined): { id: string; url: string } | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, FORUM_INDEX_BASE);
    if (url.origin !== CAMPUS_ORIGIN || url.pathname !== '/mod/forum/view.php') return undefined;
    const id = url.searchParams.get('id') || url.searchParams.get('f');
    return id && /^\d+$/.test(id) ? { id, url: url.href } : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Parsea el listado de foros de una materia (/mod/forum/index.php?id=...).
 * El Campus enlaza los foros con rutas relativas y con el id de instancia ("view.php?f=2106"), por eso
 * el `id` devuelto puede ser de instancia: usá siempre la `url` para abrir el foro.
 */
export function parseForumsList(html: string): ForumItem[] {
  const $ = cheerio.load(html);
  const forums: ForumItem[] = [];

  $('table.generaltable tbody tr, table.forumheaderlist tbody tr').each((_, el) => {
    const $row = $(el);
    const link = $row.find('a[href]').toArray().map(a => ({ a, target: forumLink($(a).attr('href')) })).find(item => item.target);
    if (!link?.target) return;
    const name = $(link.a).text().replace(/\s+/g, ' ').trim();
    const description = ($row.find('.column-description, td.cell.c1').first().html() || '')
      .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || undefined;

    const discussionsCountText = $row.find('.column-discussions, td.cell.c2').text().trim();
    const discussionsCount = discussionsCountText ? parseInt(discussionsCountText, 10) : undefined;

    const unreadCountText = $row.find('.column-unread').text().trim();
    const unreadCount = unreadCountText ? parseInt(unreadCountText, 10) : undefined;

    if (name && !forums.some(f => f.id === link.target!.id)) {
      forums.push({
        id: link.target.id,
        name,
        description,
        discussionsCount: discussionsCount === undefined || isNaN(discussionsCount) ? undefined : discussionsCount,
        unreadCount: unreadCount === undefined || isNaN(unreadCount) ? undefined : unreadCount,
        url: link.target.url
      });
    }
  });

  // Si no había tabla generaltable, buscar enlaces directos a foros en la página
  if (forums.length === 0) {
    $('a[href]').each((_, el) => {
      const target = forumLink($(el).attr('href'));
      const name = $(el).text().replace(/\s+/g, ' ').trim();
      if (target && name && !forums.some(f => f.id === target.id)) {
        forums.push({ id: target.id, name, url: target.url });
      }
    });
  }

  return forums;
}

function timestampIso(el: ReturnType<cheerio.CheerioAPI>): string | undefined {
  const raw = el.attr('data-timestamp');
  return raw && /^\d+$/.test(raw) ? epochToCampusIso(Number(raw)) : undefined;
}

/**
 * Parsea la lista de temas / discusiones de un foro (/mod/forum/view.php?id=...).
 * Moodle 4.x trae autor y fecha en celdas con `<time data-timestamp>`; se usa ese epoch para tener
 * fechas ISO exactas y se conservan los selectores clásicos como alternativa.
 */
export function parseForumDiscussions(html: string): DiscussionItem[] {
  const $ = cheerio.load(html);
  const discussions: DiscussionItem[] = [];

  $('table.forumheaderlist tbody tr, tr.discussion, .discussion-list .discussion').each((_, el) => {
    const $row = $(el);
    const topicLink = $row.find('a[href*="/mod/forum/discuss.php"]').first();
    const href = topicLink.attr('href');
    if (!href) return;

    const idMatch = href.match(/[?&]d=(\d+)/);
    const id = idMatch ? idMatch[1] : $row.attr('data-discussionid') || '';
    const title = (topicLink.attr('title') || topicLink.text()).replace(/\s+/g, ' ').trim();

    const $author = $row.find('td.author, .author').first();
    const authorName = $author.find('.author-info > div').first().text().replace(/\s+/g, ' ').trim() ||
      $author.find('a').first().text().replace(/\s+/g, ' ').trim() ||
      $author.clone().find('time').remove().end().text().replace(/\s+/g, ' ').trim();
    const createdTime = $author.find('time').first();
    const modifiedTime = $row.find('time[id^="time-modified"]').first();
    const modifiedCell = modifiedTime.closest('td');
    const lastPostAuthor = modifiedCell.find('.author-info > div').first().text().replace(/\s+/g, ' ').trim() || undefined;

    const repliesText = $row.find('.replies, td.replies, .discussion-replies').first().text().trim() ||
      $row.find('td.text-center span').first().text().trim();
    const repliesCount = repliesText ? parseInt(repliesText, 10) : 0;
    const lastPostDate = modifiedTime.closest('a').attr('title') ||
      $row.find('.lastpost, td.lastpost, .discussion-last-post').text().replace(/\s+/g, ' ').trim() ||
      modifiedTime.text().replace(/\s+/g, ' ').trim() || undefined;
    const createdDate = createdTime.text().replace(/\s+/g, ' ').trim() || undefined;

    if (id && title) {
      discussions.push({
        id,
        title,
        author: authorName || 'Desconocido',
        createdDate,
        createdDateIso: timestampIso(createdTime),
        repliesCount: isNaN(repliesCount) ? 0 : repliesCount,
        lastPostDate,
        lastPostDateIso: timestampIso(modifiedTime),
        lastPostAuthor,
        pinned: $row.find('[data-region="pinned-label"]:not([hidden]), .pinned-icon').length > 0 || undefined,
        url: new URL(href, CAMPUS_ORIGIN).href
      });
    }
  });

  return discussions;
}

/**
 * Parsea las publicaciones y respuestas de un hilo de discusión (/mod/forum/discuss.php?d=...)
 */
export function parseDiscussionPosts(html: string): ForumPostItem[] {
  const $ = cheerio.load(html);
  const posts: ForumPostItem[] = [];

  $('.forumpost, article.forum-post-container').each((_, el) => {
    const $post = $(el);
    const postId = $post.attr('data-post-id') || $post.attr('id')?.replace(/^p/, '') || '';

    const subject = $post.find('.subject, h3.lead, .p-title, [data-region-content="forum-post-core-subject"]').first().text().trim();
    const author = $post.find('.author a, .author-name, .author, header a[href*="/user/view.php"]').first().text().trim();
    const authorPicture = $post.find('.authorpicture img, .userpicture').first().attr('src');
    const timeEl = $post.find('time').first();
    const date = $post.find('.time, .header .text-muted, time').first().text().trim();
    const datetime = timeEl.attr('datetime');
    const dateIso = datetime && !Number.isNaN(Date.parse(datetime)) ? datetime : undefined;

    // Contenido
    const contentEl = $post.find('.post-content-container, .post-content, .content, .posting').first();
    contentEl.find('.commands, .post-actions, .sr-only').remove();
    const messageHtml = contentEl.html() || '';
    const messageMarkdown = turndown.turndown(messageHtml).trim();

    // Adjuntos en la publicación
    const attachments: Attachment[] = [];
    $post.find('.attachments a, .post-attachments a').each((__, ael) => {
      const aHref = $(ael).attr('href');
      const aName = $(ael).text().trim();
      if (aHref && aName) {
        attachments.push({
          name: aName,
          url: new URL(aHref, CAMPUS_ORIGIN).href
        });
      }
    });

    posts.push({
      id: postId,
      subject,
      author,
      authorPicture,
      date,
      dateIso,
      messageHtml,
      messageMarkdown,
      attachments: attachments.length > 0 ? attachments : undefined
    });
  });

  return posts;
}
