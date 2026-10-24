import * as cheerio from 'cheerio';
import { campusClient } from '../src/client/campus-client.js';
import { CAMPUS_ORIGIN, PATHS } from '../src/config.js';
import { handleListCourses } from '../src/tools/list-courses.js';
import { handleListAssignments } from '../src/tools/list-assignments.js';
import { handleListForums } from '../src/tools/forums.js';
import { handleListResources } from '../src/tools/list-resources.js';
import { handleWhoami } from '../src/tools/whoami.js';
import { handleOpen } from '../src/tools/open.js';
import { handleGetAssignment } from '../src/tools/get-assignment.js';
import { handleReadFile } from '../src/tools/read-file.js';
import { findAssignmentEditUrl, parseAssignmentUploadContract } from '../src/client/moodle-assignment-form.js';
import { parseCourses } from '../src/parsers/courses.js';

type FormSummary = {
  action: string;
  method: string;
  hasFileInput: boolean;
  hasFileManager: boolean;
  hasSaveButton: boolean;
  hasSubmitButton: boolean;
};

type PageSummary = {
  submissionControlCount: number;
  assignmentActionCount: number;
  hasSubmissionStatus: boolean;
  hasAddSubmission: boolean;
  hasEditSubmission: boolean;
  hasFinalSubmit: boolean;
  hasDraftMarker: boolean;
  forms: FormSummary[];
};

type CoursePageSummary = {
  page: 'courses' | 'dashboard';
  parsedCourseCount?: number;
  courseLinkCount?: number;
  validCourseLinkCount?: number;
  courseCardCount?: number;
  hasLoginForm?: boolean;
  hasUserMenu?: boolean;
  hasMoodlePageShell?: boolean;
  hasCourseLoadingRegion?: boolean;
  courseRelatedScriptCount?: number;
  hasEmptyCourseMarker?: boolean;
  errorCategory?: string;
};

async function inspectCoursePage(page: CoursePageSummary['page'], path: string): Promise<CoursePageSummary> {
  try {
    const html = await campusClient.getHtml(path);
    const $ = cheerio.load(html);
    const bodyText = ($('[role=main]').first().text() || $('body').text()).replace(/\s+/g, ' ').toLocaleLowerCase();
    const courseLinks = $('a[href*="/course/view.php"]');
    const scriptSources = $('script[src]').map((_, element) => String($(element).attr('src') || '')).get();
    let validCourseLinkCount = 0;
    courseLinks.each((_, element) => {
      try {
        const url = new URL(String($(element).attr('href') || ''), CAMPUS_ORIGIN);
        const id = url.searchParams.get('id');
        if (url.origin === CAMPUS_ORIGIN && url.protocol === 'https:' && !url.username && !url.password && id && /^\d+$/.test(id) && id !== '1') {
          validCourseLinkCount += 1;
        }
      } catch {
        // Count only valid same-campus-looking course links; never output their values.
      }
    });
    return {
      page,
      parsedCourseCount: parseCourses(html).length,
      courseLinkCount: courseLinks.length,
      validCourseLinkCount,
      courseCardCount: $('.coursebox, .dashboard-card, [data-region="course-content"]').length,
      hasLoginForm: Boolean($('form#loginform, form[action*="/login/"]').length || $('input[name="username"]').length && $('input[name="password"]').length),
      hasUserMenu: Boolean($('.usermenu, .userbutton, .usertext').length),
      hasMoodlePageShell: Boolean($('body#page-my-index, body#page-my-courses, #page, #page-wrapper, [data-region="mainpage"]').length),
      hasCourseLoadingRegion: Boolean($('[data-region*="course"], [data-region*="dashboard"], [data-region*="paged-content"]').length),
      courseRelatedScriptCount: scriptSources.filter(src => /course|dashboard|paged_content/i.test(src)).length,
      hasEmptyCourseMarker: /no courses|no courses found|no hay cursos|sin cursos|no est[aá]s matriculado/i.test(bodyText)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message.match(/HTTP\s+(\d{3})/i)?.[1];
    return { page, errorCategory: status ? `http-${status}` : /sesi[oó]n.*expir/i.test(message) ? 'session-expired' : 'request-error' };
  }
}

function safeErrorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const status = message.match(/HTTP\s+(\d{3})/i)?.[1];
  return status ? `http-${status}` : /sesi[oó]n.*expir/i.test(message) ? 'session-expired' : 'request-error';
}

function assignmentStatusCategory(status: string | undefined): 'submitted' | 'draft' | 'closed' | 'not_submitted' | 'unknown' {
  const value = (status || '').toLocaleLowerCase();
  if (/submitted for grading|enviado para calificar|entregad[oa]\s+(?:para|definitiv)/i.test(value)) return 'submitted';
  if (/no se aceptan env[ií]os|submission period is over|submission closed|actividad cerrada|tarea cerrada/i.test(value)) return 'closed';
  if (/borrador|draft/i.test(value)) return 'draft';
  if (/no entregado|not submitted|sin entrega/i.test(value)) return 'not_submitted';
  return 'unknown';
}

function summarizePage(html: string): PageSummary {
  const $ = cheerio.load(html);
  const forms = $('form').map((_, element) => {
    const form = $(element);
    let action = 'unknown';
    try {
      action = new URL(form.attr('action') || '', 'https://campusvirtual.frm.utn.edu.ar').pathname;
    } catch {
      // Report only a generic fallback.
    }
    const buttonLabels = form.find('button,input[type=submit],input[type=button]')
      .map((__, button) => $(button).text().trim() || String($(button).val() || ''))
      .get().join(' ').toLocaleLowerCase();
    return {
      action,
      method: (form.attr('method') || 'get').toLowerCase(),
      hasFileInput: form.find('input[type=file]').length > 0,
      hasFileManager: form.find('input[name="files_filemanager"],[data-fieldtype="filemanager"]').length > 0,
      hasSaveButton: /guardar cambios|save changes/i.test(buttonLabels),
      hasSubmitButton: /enviar tarea|enviar para calificar|submit assignment/i.test(buttonLabels)
    };
  }).get();

  const controls = $('a[href*="/mod/assign/"],button,input[type=submit]');
  const labels = controls.map((_, element) => {
    const control = $(element);
    return control.text().trim() || String(control.attr('value') || '');
  }).get().join(' ').toLocaleLowerCase();
  const bodyText = ($('[role=main]').first().text() || $('body').text()).replace(/\s+/g, ' ').toLocaleLowerCase();

  return {
    submissionControlCount: controls.filter((_, element) =>
      /entrega|submission|submit/i.test($(element).text() || String($(element).attr('value') || ''))
    ).length,
    assignmentActionCount: $('a[href*="/mod/assign/"][href*="action="]').length,
    hasSubmissionStatus: /estado de la entrega|submission status/i.test(bodyText),
    hasAddSubmission: /agregar entrega|añadir entrega|add submission/i.test(labels),
    hasEditSubmission: /editar entrega|edit submission/i.test(labels),
    hasFinalSubmit: /enviar tarea|enviar para calificar|submit assignment/i.test(labels),
    hasDraftMarker: /borrador|draft/i.test(bodyText),
    forms
  };
}

async function inspectPage(area: string, path: string): Promise<{
  area: string;
  httpStatus?: number;
} & Partial<PageSummary>> {
  try {
    const html = await campusClient.getHtml(path);
    return { area, ...summarizePage(html) };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const match = message.match(/HTTP\s+(\d{3})/i);
    return { area, httpStatus: match ? Number(match[1]) : undefined };
  }
}

async function main(): Promise<void> {
  const summaries: Array<{ area: string } & Partial<PageSummary> & { httpStatus?: number }> = [];
  try {
    const coursePages = await Promise.all([
      inspectCoursePage('courses', PATHS.courses),
      inspectCoursePage('dashboard', PATHS.dashboard)
    ]);
    if (process.argv.includes('--verify-priority-reads')) {
      const courseResult = await handleListCourses();
      const courseChecks: Array<Record<string, unknown>> = [];
      let assignmentDetailChecked = false;
      let documentContentChecked = false;
      for (const course of courseResult.courses.slice(0, 3)) {
        const courseCheck: Record<string, unknown> = {};
        try {
          const opened = await handleOpen(course.id);
          courseCheck.open = { status: 'passed', kind: opened.kind, childCount: opened.children.length };
        } catch (error) {
          courseCheck.open = { status: 'failed', category: safeErrorCategory(error) };
        }
        try {
          const assignments = await handleListAssignments(course.id);
          courseCheck.listAssignments = { status: 'passed', count: assignments.count };
          const firstAssignment = assignments.assignments[0];
          if (firstAssignment) {
            try {
              const detail = await handleGetAssignment(firstAssignment.id);
              courseCheck.getAssignment = {
                status: 'passed',
                hasDescription: Boolean(detail.descriptionMarkdown.trim()),
                attachmentCount: detail.attachments.length,
                hasDueDate: Boolean(detail.dueDate),
                hasSubmissionStatus: Boolean(detail.submissionStatus),
                submissionStatusCategory: assignmentStatusCategory(detail.submissionStatus)
              };
              try {
                const taskHtml = await campusClient.getHtml(detail.url);
                const pageSignals = summarizePage(taskHtml);
                courseCheck.submissionPage = {
                  submissionControlCount: pageSignals.submissionControlCount,
                  assignmentActionCount: pageSignals.assignmentActionCount,
                  formCount: pageSignals.forms.length,
                  hasSubmissionStatus: pageSignals.hasSubmissionStatus,
                  hasAddSubmission: pageSignals.hasAddSubmission,
                  hasEditSubmission: pageSignals.hasEditSubmission,
                  hasFinalSubmit: pageSignals.hasFinalSubmit,
                  hasDraftMarker: pageSignals.hasDraftMarker
                };
                const editUrl = findAssignmentEditUrl(taskHtml, detail.id);
                if (editUrl) {
                  const editHtml = await campusClient.getHtml(editUrl);
                  const form = parseAssignmentUploadContract(editHtml);
                  courseCheck.submissionForm = {
                    status: 'inspected_read_only',
                    editControl: true,
                    recognizedForm: Boolean(form),
                    supportsFiles: Boolean(form?.fileManagerField),
                    supportsOnlineText: Boolean(form?.textField),
                    hasFileCountLimit: Boolean(form?.maxFiles),
                    hasFileSizeLimit: Boolean(form?.maxFileBytes),
                    hasAcceptedTypeList: Boolean(form?.allowedFileTypes?.length)
                  };
                } else {
                  courseCheck.submissionForm = { status: 'no_edit_control_in_page', editControl: false };
                }
              } catch (error) {
                courseCheck.submissionForm = { status: 'failed', category: safeErrorCategory(error) };
              }
              if (!documentContentChecked && detail.attachments[0]?.url) {
                try {
                  const document = await handleReadFile({ url: detail.attachments[0].url, page_size: 1024 });
                  courseCheck.readAssignmentMaterial = {
                    status: 'passed',
                    format: document.extractedFormat,
                    extractionStatus: document.extractionStatus,
                    extractedCharacterCount: document.content.length,
                    warningCount: document.extractionWarnings.length,
                    ocrPerformed: document.ocrPerformed
                  };
                } catch (error) {
                  courseCheck.readAssignmentMaterial = { status: 'failed', category: safeErrorCategory(error) };
                }
                documentContentChecked = true;
              }
              assignmentDetailChecked = true;
            } catch (error) {
              courseCheck.getAssignment = { status: 'failed', category: safeErrorCategory(error) };
              assignmentDetailChecked = true;
            }
          }
        } catch (error) {
          courseCheck.listAssignments = { status: 'failed', category: safeErrorCategory(error) };
        }
        try {
          const resources = await handleListResources(course.id);
          const resourceTypes: Record<string, number> = {};
          for (const resource of resources.resources) resourceTypes[resource.type] = (resourceTypes[resource.type] || 0) + 1;
          courseCheck.listResources = { status: 'passed', count: resources.count, types: resourceTypes };
        } catch (error) {
          courseCheck.listResources = { status: 'failed', category: safeErrorCategory(error) };
        }
        courseChecks.push(courseCheck);
      }
      console.log(JSON.stringify({
        authenticatedReadOnlyProbe: true,
        coursePages,
        listCourses: { status: 'passed', count: courseResult.count },
        courseChecks,
        getAssignment: assignmentDetailChecked ? 'checked' : 'no-assignment-found-in-first-three-courses',
        readAssignmentMaterial: documentContentChecked ? 'checked-one-file' : 'no-attachment-found-in-checked-assignment'
      }, null, 2));
      return;
    }
    if (process.argv.includes('--courses-only')) {
      const renderDiagnostics = {
        readOnlyAjaxMethods: [] as string[],
        blockedPostMethodNames: [] as string[],
        unrecognizedPostCount: 0,
        responseStatusCounts: {} as Record<string, number>,
        finalPath: undefined as string | undefined
      };
      const renderedHtml = await campusClient.getRenderedHtml(
        PATHS.courses,
        '.coursebox, .dashboard-card, a[href*="/course/view.php"]',
        renderDiagnostics
      );
      console.log(JSON.stringify({
        authenticatedReadOnlyProbe: true,
        coursePages,
        renderedCourseCount: parseCourses(renderedHtml).length,
        renderDiagnostics
      }, null, 2));
      return;
    }
    let courseList = (await handleListCourses()).courses;
    if (!courseList.length) courseList = (await handleWhoami()).enrolledCourses;
    const courses = courseList.slice(0, 3);
    let assignmentCount = 0;
    for (const course of courses) {
      const assignments = (await handleListAssignments(course.id)).assignments.slice(0, 10);
      assignmentCount += assignments.length;
      for (const assignment of assignments) {
        const assignmentPath = PATHS.assignView(assignment.id);
        const assignmentPage = await inspectPage('assignment', assignmentPath);
        summaries.push(assignmentPage);
        try {
          const assignmentHtml = await campusClient.getHtml(assignmentPath);
          const editUrl = findAssignmentEditUrl(assignmentHtml, assignment.id);
          if (editUrl) summaries.push(await inspectPage('assignment-edit-form', editUrl));
        } catch {
          // The page summary above already records its availability without content.
        }
      }
      const forums = (await handleListForums(course.id)).forums.slice(0, 1);
      if (forums[0]) {
        summaries.push(await inspectPage('forum-create', `/mod/forum/post.php?forum=${forums[0].id}`));
        summaries.push(await inspectPage('forum-list', PATHS.forumView(forums[0].id)));
      }
      const resources = (await handleListResources(course.id)).resources;
      const choice = resources.find(resource => resource.type === 'choice');
      if (choice) summaries.push(await inspectPage('choice', choice.url));
    }

    summaries.push(await inspectPage('calendar-create', '/calendar/event.php?action=new'));
    summaries.push(await inspectPage('messages', '/message/index.php'));
    console.log(JSON.stringify({
      authenticatedReadOnlyProbe: true,
      coursePages,
      coursesChecked: courses.length,
      assignmentsChecked: assignmentCount,
      areas: summaries
    }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const match = message.match(/HTTP\s+(\d{3})/i);
    console.log(JSON.stringify({
      authenticatedReadOnlyProbe: true,
      error: error instanceof Error ? error.name : 'UnknownError',
      httpStatus: match ? Number(match[1]) : undefined,
      areas: summaries
    }, null, 2));
    process.exitCode = 1;
  } finally {
    await campusClient.close();
  }
}

void main();
