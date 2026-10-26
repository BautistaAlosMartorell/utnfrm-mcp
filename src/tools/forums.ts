import { campusClient } from '../client/campus-client.js';
import { parseForumsList, parseForumDiscussions, parseDiscussionPosts } from '../parsers/forums.js';
import { ForumItem, DiscussionItem, ForumPostItem } from '../types/index.js';
import { PATHS } from '../config.js';
import { requireMoodleId } from '../client/moodle-id.js';
import { resolveCampusUrl } from '../client/campus-url.js';
import { resolveCourse } from './course-ref.js';
import { writesDisabledResult } from '../client/write-policy.js';

/**
 * Acepta el id del módulo (cmid), o una URL de foro con `id` (módulo) o `f` (instancia). `list_forums`
 * devuelve ids de instancia en este Campus, por eso se admite la URL completa.
 */
export function resolveForumView(forumIdOrUrl: string): { forumId: string; path: string } {
  const candidate = forumIdOrUrl.trim();
  if (/^\d{1,12}$/.test(candidate)) return { forumId: candidate, path: PATHS.forumView(candidate) };
  const url = new URL(resolveCampusUrl(candidate));
  if (url.pathname !== '/mod/forum/view.php') {
    throw new Error('Se esperaba un ID de foro o una URL de /mod/forum/view.php del Campus.');
  }
  const moduleId = url.searchParams.get('id');
  if (moduleId && /^\d{1,12}$/.test(moduleId)) return { forumId: moduleId, path: PATHS.forumView(moduleId) };
  const instanceId = url.searchParams.get('f');
  if (instanceId && /^\d{1,12}$/.test(instanceId)) {
    return { forumId: instanceId, path: `/mod/forum/view.php?f=${instanceId}` };
  }
  throw new Error('La URL del foro debe incluir un valor numérico en id o f.');
}

export async function handleListForums(courseId: string): Promise<{
  courseId: string;
  forums: ForumItem[];
  count: number;
}> {
  const cleanCourseId = (await resolveCourse(courseId)).id;
  const html = await campusClient.getHtml(PATHS.forumIndex(cleanCourseId));
  const forums = parseForumsList(html);

  return {
    courseId: cleanCourseId,
    forums,
    count: forums.length
  };
}

export async function handleGetForumDiscussions(forumIdOrUrl: string): Promise<{
  forumId: string;
  discussions: DiscussionItem[];
  count: number;
}> {
  const { forumId, path } = resolveForumView(forumIdOrUrl);
  const html = await campusClient.getHtml(path);
  const discussions = parseForumDiscussions(html);

  return {
    forumId,
    discussions,
    count: discussions.length
  };
}

export async function handleGetDiscussionPosts(discussionIdOrUrl: string): Promise<{
  discussionId: string;
  posts: ForumPostItem[];
  count: number;
}> {
  const discussionId = requireMoodleId(discussionIdOrUrl, 'd');
  const html = await campusClient.getHtml(PATHS.forumDiscuss(discussionId));
  const posts = parseDiscussionPosts(html);

  return {
    discussionId,
    posts,
    count: posts.length
  };
}

export interface ForumPostTopicInput {
  course_id: string;
  forum_id: string;
  subject: string;
  message: string;
  confirm: boolean;
}

export async function handleForumPostTopic(input: ForumPostTopicInput): Promise<{
  status: 'preview' | 'success' | 'error';
  message: string;
  requires_confirmation?: boolean;
  action?: string;
  details?: Record<string, any>;
}> {
  const cleanForumId = requireMoodleId(input.forum_id);
  const cleanCourseId = requireMoodleId(input.course_id);
  if (input.confirm) return writesDisabledResult();

  // Escritura deshabilitada: la herramienta solo puede devolver una vista previa.
  if (!input.confirm) {
    return {
      status: 'preview',
      requires_confirmation: false,
      action: 'Vista previa de tema; no se puede publicar desde el MCP',
      message: 'Vista previa únicamente. Este MCP no puede publicar en foros; si querés publicarlo, hacelo directamente en el Campus.',
      details: {
        course_id: cleanCourseId,
        forum_id: cleanForumId,
        subject: input.subject,
        message_length: input.message.length,
        message_preview: input.message.slice(0, 200) + (input.message.length > 200 ? '...' : ''),
        write_attempted: false
      }
    };
  }

  // 2. Ejecución real con validación
  let writeAttempted = false;
  try {
    const courseForums = await handleListForums(cleanCourseId);
    if (!courseForums.forums.some(forum => forum.id === cleanForumId)) {
      throw new Error('El foro indicado no pertenece a la materia seleccionada o no es visible.');
    }
    const postPageUrl = `/mod/forum/post.php?forum=${cleanForumId}`;
    const formHtml = await campusClient.getHtml(postPageUrl);
    if (!/name=["']subject["']/i.test(formHtml) || !/message\[(text|itemid)\]/i.test(formHtml)) {
      throw new Error('El Campus no mostró un formulario de publicación autorizado para este foro.');
    }
    const before = await handleGetForumDiscussions(cleanForumId);
    const previousIds = new Set(before.discussions.map(discussion => discussion.id));

    // Extraer sesskey de la página de posteo
    const sesskeyMatch = formHtml.match(/name="sesskey"\s+value="([a-zA-Z0-9]+)"/) ||
                         formHtml.match(/"sesskey":"([a-zA-Z0-9]+)"/);
    const sesskey = sesskeyMatch ? sesskeyMatch[1] : await campusClient.getSesskey();

    const postData: Record<string, string> = {
      mform_isexpanded_id_general: '1',
      forum: cleanForumId,
      sesskey,
      _qf__mod_forum_post_form: '1',
      subject: input.subject,
      'message[text]': input.message,
      'message[format]': '1',
      submitbutton: 'Enviar al foro'
    };

    writeAttempted = true;
    const result = await campusClient.postForm('/mod/forum/post.php', postData);
    if (result.status < 200 || result.status >= 400) {
      throw new Error(`El Campus respondió HTTP ${result.status}; verificá el foro antes de reintentar.`);
    }

    const after = await handleGetForumDiscussions(cleanForumId);
    const created = after.discussions.find(discussion =>
      !previousIds.has(discussion.id) && discussion.title.trim() === input.subject.trim()
    );
    if (created) {
      return {
        status: 'success',
        message: 'Tema publicado y verificado en el foro de Moodle.',
        details: {
          forum_id: cleanForumId,
          subject: input.subject,
          url: created.url
        }
      };
    } else {
      return {
        status: 'error',
        message: 'El Campus recibió la solicitud, pero no se pudo verificar un tema nuevo. Revisá el foro antes de volver a intentar.',
        details: { verified: false, mayHaveSucceeded: true }
      };
    }
  } catch (err: any) {
    return {
      status: 'error',
      message: writeAttempted
        ? 'No se pudo confirmar la publicación. No vuelvas a publicarla todavía: revisá primero el foro.'
        : `Error al publicar en el foro: ${err.message || String(err)}`,
      ...(writeAttempted ? { details: { write_attempted: true, verified: false, mayHaveSucceeded: true } } : {})
    };
  }
}

export interface ForumReplyInput {
  discussion_id: string;
  parent_post_id?: string;
  message: string;
  confirm: boolean;
}

export async function handleForumReply(input: ForumReplyInput): Promise<{
  status: 'preview' | 'success' | 'error';
  message: string;
  requires_confirmation?: boolean;
  action?: string;
  details?: Record<string, any>;
}> {
  const cleanDiscId = requireMoodleId(input.discussion_id, 'd');
  if (input.confirm) return writesDisabledResult();

  // Escritura deshabilitada: la herramienta solo puede devolver una vista previa.
  if (!input.confirm) {
    return {
      status: 'preview',
      requires_confirmation: false,
      action: 'Vista previa de respuesta; no se puede publicar desde el MCP',
      message: 'Vista previa únicamente. Este MCP no puede publicar respuestas; si querés responder, hacelo directamente en el Campus.',
      details: {
        discussion_id: cleanDiscId,
        parent_post_id: input.parent_post_id || 'primer post del hilo',
        message_length: input.message.length,
        message_preview: input.message.slice(0, 200) + (input.message.length > 200 ? '...' : ''),
        write_attempted: false
      }
    };
  }

  // 2. Ejecución real
  let writeAttempted = false;
  try {
    const discHtml = await campusClient.getHtml(PATHS.forumDiscuss(cleanDiscId));
    const before = parseDiscussionPosts(discHtml);
    let replyPostId = input.parent_post_id;
    if (replyPostId) replyPostId = requireMoodleId(replyPostId);
    if (!replyPostId) {
      const matchPost = discHtml.match(/data-post-id="(\d+)"/) || discHtml.match(/id="p(\d+)"/);
      if (matchPost) replyPostId = matchPost[1];
    }

    if (!replyPostId) {
      throw new Error('No se pudo identificar el ID del mensaje padre para responder.');
    }
    if (!before.some(post => post.id === replyPostId)) {
      throw new Error('El mensaje padre no pertenece a esta discusión.');
    }
    if (!/post\.php\?reply=|name=["']reply["']/i.test(discHtml)) {
      throw new Error('El Campus no habilitó la respuesta en esta discusión.');
    }

    const sesskey = await campusClient.getSesskey();
    const postData: Record<string, string> = {
      reply: replyPostId,
      sesskey,
      _qf__mod_forum_post_form: '1',
      subject: 'Re: Respuesta',
      'message[text]': input.message,
      'message[format]': '1',
      submitbutton: 'Enviar al foro'
    };

    writeAttempted = true;
    const result = await campusClient.postForm('/mod/forum/post.php', postData);
    if (result.status < 200 || result.status >= 400) {
      throw new Error(`El Campus respondió HTTP ${result.status}; verificá la discusión antes de reintentar.`);
    }
    const after = await handleGetDiscussionPosts(cleanDiscId);
    const previousIds = new Set(before.map(post => post.id));
    const normalizedMessage = input.message.replace(/\s+/g, ' ').trim();
    const created = after.posts.find(post => !previousIds.has(post.id) &&
      post.messageMarkdown.replace(/\s+/g, ' ').includes(normalizedMessage));
    if (!created) {
      return {
        status: 'error',
        message: 'El Campus recibió la solicitud, pero no se pudo verificar la respuesta. Revisá la discusión antes de volver a intentar.',
        details: { verified: false, mayHaveSucceeded: true }
      };
    }
    return {
      status: 'success',
      message: 'Respuesta publicada y verificada en el foro.',
      details: {
        discussion_id: cleanDiscId,
        reply_to_post: replyPostId,
        post_id: created.id
      }
    };
  } catch (err: any) {
    return {
      status: 'error',
      message: writeAttempted
        ? 'No se pudo confirmar la respuesta. No la vuelvas a publicar todavía: revisá primero la discusión.'
        : `Error al responder en el foro: ${err.message || String(err)}`,
      ...(writeAttempted ? { details: { write_attempted: true, verified: false, mayHaveSucceeded: true } } : {})
    };
  }
}
