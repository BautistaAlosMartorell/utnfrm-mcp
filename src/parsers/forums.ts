import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import { ForumItem, DiscussionItem, ForumPostItem, Attachment } from '../types/index.js';
import { CAMPUS_ORIGIN } from '../config.js';

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-'
});

/**
 * Parsea el listado de foros de una materia (/mod/forum/index.php?id=...)
 */
export function parseForumsList(html: string): ForumItem[] {
  const $ = cheerio.load(html);
  const forums: ForumItem[] = [];

  $('table.generaltable tbody tr, table.forumheaderlist tbody tr').each((_, el) => {
    const $row = $(el);
    const link = $row.find('a[href*="/mod/forum/view.php"]').first();
    const href = link.attr('href');
    if (!href) return;

    const idMatch = href.match(/[?&]id=(\d+)/);
    const id = idMatch ? idMatch[1] : '';
    const name = link.text().trim();
    const description = $row.find('.column-description, td.cell.c1').text().trim() || undefined;

    const discussionsCountText = $row.find('.column-discussions, td.cell.c2').text().trim();
    const discussionsCount = discussionsCountText ? parseInt(discussionsCountText, 10) : undefined;

    const unreadCountText = $row.find('.column-unread, td.cell.c3').text().trim();
    const unreadCount = unreadCountText ? parseInt(unreadCountText, 10) : undefined;

    if (id && name) {
      forums.push({
        id,
        name,
        description,
        discussionsCount: isNaN(discussionsCount!) ? undefined : discussionsCount,
        unreadCount: isNaN(unreadCount!) ? undefined : unreadCount,
        url: new URL(href, CAMPUS_ORIGIN).href
      });
    }
  });

  // Si no había tabla generaltable, buscar enlaces directos a foros en la página
  if (forums.length === 0) {
    $('a[href*="/mod/forum/view.php?id="]').each((_, el) => {
      const href = $(el).attr('href')!;
      const match = href.match(/id=(\d+)/);
      const name = $(el).text().trim();
      if (match && name && !forums.some(f => f.id === match[1])) {
        forums.push({
          id: match[1],
          name,
          url: new URL(href, CAMPUS_ORIGIN).href
        });
      }
    });
  }

  return forums;
}

/**
 * Parsea la lista de temas / discusiones de un foro (/mod/forum/view.php?id=...)
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
    const id = idMatch ? idMatch[1] : '';
    const title = topicLink.text().trim();

    const author = $row.find('.author a, .author, td.author').text().trim() || 'Desconocido';
    const repliesText = $row.find('.replies, td.replies, .discussion-replies').text().trim();
    const repliesCount = repliesText ? parseInt(repliesText, 10) : 0;
    const lastPostDate = $row.find('.lastpost, td.lastpost, .discussion-last-post').text().trim() || undefined;

    if (id && title) {
      discussions.push({
        id,
        title,
        author,
        repliesCount: isNaN(repliesCount) ? 0 : repliesCount,
        lastPostDate,
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

    const subject = $post.find('.subject, h3.lead, .p-title').first().text().trim();
    const author = $post.find('.author a, .author-name, .author').first().text().trim();
    const authorPicture = $post.find('.authorpicture img, .userpicture').first().attr('src');
    const date = $post.find('.time, .header .text-muted, time').first().text().trim();

    // Contenido
    const contentEl = $post.find('.post-content, .content, .posting').first();
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
      messageHtml,
      messageMarkdown,
      attachments: attachments.length > 0 ? attachments : undefined
    });
  });

  return posts;
}
