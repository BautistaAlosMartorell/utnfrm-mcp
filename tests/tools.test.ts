import { describe, it, expect } from 'vitest';
import {
  ListCoursesInputSchema,
  ListAssignmentsInputSchema,
  GetAssignmentInputSchema,
  ListResourcesInputSchema,
  OpenInputSchema,
  ReadFileInputSchema,
  GetGradesInputSchema,
  WhoamiInputSchema,
  ListParticipantsInputSchema,
  ListForumsInputSchema,
  GetForumDiscussionsInputSchema,
  GetDiscussionPostsInputSchema,
  ForumPostTopicInputSchema,
  ForumReplyInputSchema,
  ListCalendarEventsInputSchema,
  CalendarAddEventInputSchema,
  GetChoiceInputSchema,
  SubmitChoiceInputSchema,
  SubmitAssignmentInputSchema
} from '../src/types/index.js';

describe('MCP Tools Schema Validation — Suite Completa V2', () => {

  // ==========================================
  // Herramientas Originales (Regresión)
  // ==========================================

  it('ListCoursesInputSchema debe aceptar objeto vacío', () => {
    expect(ListCoursesInputSchema.safeParse({}).success).toBe(true);
  });

  it('ListAssignmentsInputSchema debe requerir course_id string', () => {
    expect(ListAssignmentsInputSchema.safeParse({ course_id: '123' }).success).toBe(true);
    expect(ListAssignmentsInputSchema.safeParse({}).success).toBe(false);
  });

  it('GetAssignmentInputSchema debe requerir assignment_id string', () => {
    expect(GetAssignmentInputSchema.safeParse({ assignment_id: '456' }).success).toBe(true);
    const validUrl = GetAssignmentInputSchema.safeParse({ assignment_id: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=456' });
    expect(validUrl.success).toBe(true);
    expect(GetAssignmentInputSchema.safeParse({}).success).toBe(false);
  });

  it('ListResourcesInputSchema debe requerir course_id string', () => {
    expect(ListResourcesInputSchema.safeParse({ course_id: '789' }).success).toBe(true);
    expect(ListResourcesInputSchema.safeParse({}).success).toBe(false);
  });

  // ==========================================
  // Herramientas Nuevas V2
  // ==========================================

  it('OpenInputSchema debe requerir id_or_url y admitir section_id opcional', () => {
    expect(OpenInputSchema.safeParse({ id_or_url: '126' }).success).toBe(true);
    expect(OpenInputSchema.safeParse({ id_or_url: '/course/view.php?id=126', section_id: '3' }).success).toBe(true);
    expect(OpenInputSchema.safeParse({}).success).toBe(false);
  });

  it('ReadFileInputSchema debe requerir url con parámetros opcionales de paginación', () => {
    expect(ReadFileInputSchema.safeParse({ url: '/mod/resource/view.php?id=49312' }).success).toBe(true);
    expect(ReadFileInputSchema.safeParse({ url: '/mod/resource/view.php?id=49312', page: 2, page_size: 4000, format: 'markdown' }).success).toBe(true);
    expect(ReadFileInputSchema.safeParse({ url: '/mod/resource/view.php?id=49312', page: 0 }).success).toBe(false); // page debe ser > 0
    expect(ReadFileInputSchema.safeParse({}).success).toBe(false);
  });

  it('GetGradesInputSchema debe requerir course_id string', () => {
    expect(GetGradesInputSchema.safeParse({ course_id: '126' }).success).toBe(true);
    expect(GetGradesInputSchema.safeParse({}).success).toBe(false);
  });

  it('WhoamiInputSchema debe aceptar objeto vacío', () => {
    expect(WhoamiInputSchema.safeParse({}).success).toBe(true);
  });

  it('ListParticipantsInputSchema debe requerir course_id y admitir filtro de rol', () => {
    expect(ListParticipantsInputSchema.safeParse({ course_id: '126' }).success).toBe(true);
    expect(ListParticipantsInputSchema.safeParse({ course_id: '126', role: 'teacher' }).success).toBe(true);
    expect(ListParticipantsInputSchema.safeParse({ course_id: '126', role: 'all' }).success).toBe(true);
    expect(ListParticipantsInputSchema.safeParse({ course_id: '126', role: 'invalid' }).success).toBe(false);
    expect(ListParticipantsInputSchema.safeParse({}).success).toBe(false);
  });

  it('ListForumsInputSchema debe requerir course_id string', () => {
    expect(ListForumsInputSchema.safeParse({ course_id: '126' }).success).toBe(true);
    expect(ListForumsInputSchema.safeParse({}).success).toBe(false);
  });

  it('GetForumDiscussionsInputSchema debe requerir forum_id string', () => {
    expect(GetForumDiscussionsInputSchema.safeParse({ forum_id: '16227' }).success).toBe(true);
    expect(GetForumDiscussionsInputSchema.safeParse({}).success).toBe(false);
  });

  it('GetDiscussionPostsInputSchema debe requerir discussion_id string', () => {
    expect(GetDiscussionPostsInputSchema.safeParse({ discussion_id: '5963' }).success).toBe(true);
    expect(GetDiscussionPostsInputSchema.safeParse({}).success).toBe(false);
  });

  it('ForumPostTopicInputSchema requiere todos los campos y confirm es false por defecto', () => {
    const parsed = ForumPostTopicInputSchema.safeParse({
      course_id: '126', forum_id: '16227', subject: 'Consulta de prueba', message: 'Este es el cuerpo del mensaje.'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.confirm).toBe(false); // default
    }
    // Subject muy corto debe fallar (min 3 chars)
    expect(ForumPostTopicInputSchema.safeParse({ course_id: '126', forum_id: '16227', subject: 'AB', message: 'Mensaje válido.' }).success).toBe(false);
    // Sin forum_id debe fallar
    expect(ForumPostTopicInputSchema.safeParse({ course_id: '126', subject: 'Consulta', message: 'Mensaje.' }).success).toBe(false);
  });

  it('ForumReplyInputSchema requiere discussion_id y message', () => {
    const parsed = ForumReplyInputSchema.safeParse({ discussion_id: '5963', message: 'Mi respuesta.' });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.confirm).toBe(false);
    }
    expect(ForumReplyInputSchema.safeParse({ discussion_id: '5963' }).success).toBe(false);
  });

  it('ListCalendarEventsInputSchema acepta vacío y days_ahead positivo', () => {
    expect(ListCalendarEventsInputSchema.safeParse({}).success).toBe(true);
    expect(ListCalendarEventsInputSchema.safeParse({ days_ahead: 30 }).success).toBe(true);
    expect(ListCalendarEventsInputSchema.safeParse({ days_ahead: 0 }).success).toBe(false);
  });

  it('CalendarAddEventInputSchema requiere name y date, confirm false por defecto', () => {
    const parsed = CalendarAddEventInputSchema.safeParse({ name: 'Parcial IA', date: '2026-11-03 18:00' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.confirm).toBe(false);
    expect(CalendarAddEventInputSchema.safeParse({ name: 'Parcial IA' }).success).toBe(false);
  });

  it('GetChoiceInputSchema requiere choice_id string', () => {
    expect(GetChoiceInputSchema.safeParse({ choice_id: '12345' }).success).toBe(true);
    expect(GetChoiceInputSchema.safeParse({}).success).toBe(false);
  });

  it('SubmitChoiceInputSchema requiere choice_id y option_id, confirm false por defecto', () => {
    const parsed = SubmitChoiceInputSchema.safeParse({ choice_id: '12345', option_id: '6' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.confirm).toBe(false);
    expect(SubmitChoiceInputSchema.safeParse({ choice_id: '12345' }).success).toBe(false);
  });

  it('SubmitAssignmentInputSchema permite texto o archivos, prepara por defecto y rechaza confirm true', () => {
    const parsed = SubmitAssignmentInputSchema.safeParse({ assignment_id: '5410', text_content: 'Texto de prueba' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ stage: 'prepare', confirm: false });
    const withText = SubmitAssignmentInputSchema.safeParse({ assignment_id: '5410', text_content: 'Mi respuesta en texto.', confirm: true });
    expect(withText.success).toBe(false);
    const withFiles = SubmitAssignmentInputSchema.safeParse({ assignment_id: '5410', attachment_paths: ['C:/entrega.pdf'] });
    expect(withFiles.success).toBe(true);
    expect(SubmitAssignmentInputSchema.safeParse({ assignment_id: '5410' }).success).toBe(true);
  });
});
