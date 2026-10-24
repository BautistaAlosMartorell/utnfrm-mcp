import { afterEach, describe, expect, it, vi } from 'vitest';
import { campusClient } from '../src/client/campus-client.js';
import { handleCalendarAddEvent } from '../src/tools/calendar.js';
import { handleSubmitChoice } from '../src/tools/choice.js';
import { handleForumPostTopic, handleForumReply } from '../src/tools/forums.js';
import { handleSubmitAssignment } from '../src/tools/submit-assignment.js';
import { sanitizeCampusErrorMessage } from '../src/client/error-sanitizer.js';
import { uploadAndSubmitAssignmentFiles } from '../src/client/moodle-assignment-uploader.js';

afterEach(() => vi.restoreAllMocks());

describe('write safety and post-state checks', () => {
  it('redacts cookie headers and Moodle session values from error messages', () => {
    const message = 'Timeout\n  - cookie: MoodleSession=session-cookie-value; MOODLEID1_=user-cookie-value';
    const sanitized = sanitizeCampusErrorMessage(message);

    expect(sanitized).not.toContain('session-cookie-value');
    expect(sanitized).not.toContain('user-cookie-value');
    expect(sanitized).toContain('cookie: [oculto]');
  });

  it('does not post a choice when explicit confirmation is absent', async () => {
    const choiceHtml = '<h2>Grupo</h2><form class="choicesform"><label><input type="radio" name="answer" value="9">Grupo 9</label><button type="submit">Guardar</button></form>';
    vi.spyOn(campusClient, 'getHtml').mockResolvedValue(choiceHtml);
    const post = vi.spyOn(campusClient, 'postForm');

    const result = await handleSubmitChoice({ choice_id: '1', option_id: '9', confirm: false });

    expect(result.status).toBe('preview');
    expect(result.requires_confirmation).toBe(false);
    expect(result.message).toMatch(/no puede registrar elecciones/i);
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps the four legacy mutating tools blocked and refuses assignment execution under its own disabled policy', async () => {
    const getHtml = vi.spyOn(campusClient, 'getHtml');
    const post = vi.spyOn(campusClient, 'postForm');
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const results = await Promise.all([
      handleForumPostTopic({ course_id: '10', forum_id: '20', subject: 'Tema válido', message: 'Mensaje de prueba', confirm: true }),
      handleForumReply({ discussion_id: '30', message: 'Respuesta de prueba', confirm: true }),
      handleCalendarAddEvent({ name: 'Evento de prueba', date: futureDate, confirm: true }),
      handleSubmitChoice({ choice_id: '40', option_id: '50', confirm: true })
    ]);

    expect(results).toHaveLength(4);
    for (const result of results) {
      expect(result.status).toBe('error');
      expect(result.details).toMatchObject({ write_attempted: false, writes_enabled: false, approval_required: 'independent-human' });
    }
    const assignment = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: '00000000-0000-4000-8000-000000000000' });
    expect(assignment.status).toBe('rejected');
    expect(assignment.details).toMatchObject({ write_attempted: false });
    expect(getHtml).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('blocks Campus POST and browser assignment upload at the shared write boundary', async () => {
    await expect(campusClient.postForm('/mod/forum/post.php', { subject: 'blocked' }))
      .rejects.toThrow(/escrituras al Campus están deshabilitadas/i);
    await expect(uploadAndSubmitAssignmentFiles({
      assignmentId: '123', editUrl: '/mod/assign/view.php?id=123', attachments: [], textContent: '', action: 'save_draft'
    })).rejects.toThrow(/entregas MCP están deshabilitadas/i);
  });

  it('keeps calendar event creation in preview without confirmation', async () => {
    const post = vi.spyOn(campusClient, 'postForm');
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const result = await handleCalendarAddEvent({
      name: 'Recordatorio de prueba',
      date: futureDate,
      confirm: false
    });

    expect(result.status).toBe('preview');
    expect(result.requires_confirmation).toBe(false);
    expect(result.message).toMatch(/no puede crear eventos/i);
    expect(result.message).not.toMatch(/confirm: true/i);
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps forum replies in preview without confirmation', async () => {
    const post = vi.spyOn(campusClient, 'postForm');
    const result = await handleForumReply({
      discussion_id: '10',
      message: 'Respuesta de prueba',
      confirm: false
    });

    expect(result.status).toBe('preview');
    expect(result.requires_confirmation).toBe(false);
    expect(result.message).toMatch(/no puede publicar respuestas/i);
    expect(result.message).not.toMatch(/confirm: true/i);
    expect(post).not.toHaveBeenCalled();
  });

  it('keeps new forum topics in preview and explains that MCP publishing is disabled', async () => {
    const post = vi.spyOn(campusClient, 'postForm');
    const result = await handleForumPostTopic({
      course_id: '10',
      forum_id: '20',
      subject: 'Tema de prueba',
      message: 'Contenido de prueba',
      confirm: false
    });

    expect(result.status).toBe('preview');
    expect(result.requires_confirmation).toBe(false);
    expect(result.message).toMatch(/no puede publicar en foros/i);
    expect(result.message).not.toMatch(/confirm: true/i);
    expect(post).not.toHaveBeenCalled();
  });
});
