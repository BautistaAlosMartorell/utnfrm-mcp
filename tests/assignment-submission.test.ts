import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleSubmitAssignment, type AssignmentSubmissionDependencies } from '../src/tools/submit-assignment.js';
import { AssignmentApprovalStore } from '../src/session/assignment-approval-store.js';
import { SubmitAssignmentInputSchema } from '../src/types/index.js';
import { classifyAssignmentWriteHttpStatus, isCampusLoginUrl, prepareAssignmentAttachments } from '../src/client/moodle-assignment-uploader.js';

const assignmentPage = fs.readFileSync(path.resolve('tests/fixtures/assignment-add-submission.html'), 'utf8');
const fileForm = fs.readFileSync(path.resolve('tests/fixtures/assignment-filemanager-form.html'), 'utf8');
const textForm = fs.readFileSync(path.resolve('tests/fixtures/assignment-online-text-form.html'), 'utf8');
const attachment = path.resolve('tests/fixtures/assignment-attachment.txt');
const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function createStore(): AssignmentApprovalStore {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-assignment-approval-'));
  tempDirs.push(directory);
  return new AssignmentApprovalStore({ directory, extension: '.json', ttlMs: 60_000, approvalTtlMs: 60_000 });
}

function dependencies(overrides: Partial<AssignmentSubmissionDependencies> = {}): AssignmentSubmissionDependencies {
  return {
    getAssignment: vi.fn().mockResolvedValue({
      id: '123', name: 'Entrega de prueba', courseName: 'Materia de prueba', descriptionMarkdown: '',
      descriptionStatus: 'not_provided', attachments: [], url: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=123',
      submissionStatus: 'Borrador (no enviado)'
    }),
    getHtml: vi.fn().mockImplementation(async (url: string) => url.includes('action=editsubmission') ? fileForm : assignmentPage),
    store: createStore(),
    enabled: false,
    hashAttachments: async files => files.map(file => ({ ...file, sha256: 'a'.repeat(64) })),
    loadAttachment: file => ({ ...file, sha256: 'a'.repeat(64), buffer: Buffer.from('fixture') }),
    upload: vi.fn().mockResolvedValue({ status: 'draft_saved', message: 'verified draft', details: { verified: true } }),
    ...overrides
  };
}

async function prepare(deps: AssignmentSubmissionDependencies, extra: Record<string, unknown> = {}) {
  return handleSubmitAssignment({ assignment_id: '123', attachment_paths: [attachment], ...extra } as never, deps);
}

describe('assignment submission preparation and approval boundary', () => {
  it('rejects legacy confirm and unknown parameters in the MCP input schema', () => {
    expect(SubmitAssignmentInputSchema.safeParse({ assignment_id: '123', confirm: true }).success).toBe(false);
  });

  it('prepares an exact preview without writing and reports execution disabled', async () => {
    const deps = dependencies();
    const result = await prepare(deps);
    expect(result).toMatchObject({ status: 'prepared', details: { write_attempted: false, local_execution_enabled: false, supports_file_submission: true } });
    expect(result.operation_id).toBeTruthy();
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('blocks execution while the independent local policy is disabled', async () => {
    const deps = dependencies();
    const result = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: '00000000-0000-4000-8000-000000000000' }, deps);
    expect(result.status).toBe('rejected');
    expect(result.details).toMatchObject({ write_attempted: false });
    expect(deps.getAssignment).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('requires an approval ID when the local execution gate is enabled', async () => {
    const deps = dependencies({ enabled: true });
    const result = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute' }, deps);
    expect(result.status).toBe('rejected');
    expect(result.message).toMatch(/ID aprobado/i);
    expect(result.details).toMatchObject({ write_attempted: false });
    expect(deps.getAssignment).not.toHaveBeenCalled();
  });

  it('validates local file paths and rejects directories before approval', async () => {
    const deps = dependencies();
    const result = await handleSubmitAssignment({ assignment_id: '123', attachment_paths: [path.resolve('tests/fixtures')] }, deps);
    expect(result.status).toBe('rejected');
    expect(result.message).toMatch(/no es un archivo normal/i);
    expect(deps.getAssignment).not.toHaveBeenCalled();
    expect(() => prepareAssignmentAttachments([path.resolve('tests/fixtures')])).toThrow(/no es un archivo normal/i);
  });

  it('classifies expired sessions and write HTTP failures conservatively', () => {
    expect(isCampusLoginUrl('https://campusvirtual.frm.utn.edu.ar/login/index.php')).toBe(true);
    expect(isCampusLoginUrl('https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=123')).toBe(false);
    expect(classifyAssignmentWriteHttpStatus(200)).toBe('accepted');
    expect(classifyAssignmentWriteHttpStatus(302)).toBe('accepted');
    expect(classifyAssignmentWriteHttpStatus(302, false)).toBe('uncertain');
    expect(classifyAssignmentWriteHttpStatus(403)).toBe('uncertain');
    expect(classifyAssignmentWriteHttpStatus(429)).toBe('uncertain');
  });

  it('requires a permitted file or text submission type and enforces Moodle file constraints', async () => {
    const restrictiveForm = fileForm.replace('<div data-fieldtype="filemanager">', '<div data-fieldtype="filemanager" data-maxfiles="1" data-maxbytes="1" data-accepted-types="*.pdf">');
    const deps = dependencies({ getHtml: vi.fn().mockImplementation(async (url: string) => url.includes('action=editsubmission') ? restrictiveForm : assignmentPage) });
    const result = await prepare(deps);
    expect(result.status).toBe('rejected');
    expect(result.message).toMatch(/máximo indicado|tipo de archivo/i);
    expect(deps.upload).not.toHaveBeenCalled();

    const typeRestrictedForm = fileForm.replace('<div data-fieldtype="filemanager">', '<div data-fieldtype="filemanager" data-maxbytes="999999" data-accepted-types="*.pdf">');
    const typeDeps = dependencies({ getHtml: vi.fn().mockImplementation(async (url: string) => url.includes('action=editsubmission') ? typeRestrictedForm : assignmentPage) });
    const typeResult = await prepare(typeDeps);
    expect(typeResult.status).toBe('rejected');
    expect(typeResult.message).toMatch(/tipo de archivo/i);
  });

  it('does not consume approval or invoke the uploader when a fresh Campus read fails before writing', async () => {
    const deps = dependencies({ enabled: true });
    const prepared = await prepare(deps);
    const id = prepared.operation_id!;
    const pending = deps.store.getForHumanApproval(id);
    deps.store.approve(id, `APROBAR ${pending.fingerprint.slice(0, 12)}`);
    (deps.getAssignment as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('HTTP 429'));
    const result = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: id }, deps);
    expect(result.status).toBe('rejected');
    expect(result.details).toMatchObject({ write_attempted: false });
    expect(deps.store.getApprovedPlan(id).plan.assignmentId).toBe('123');
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('rejects an already submitted assignment before creating an approval', async () => {
    const deps = dependencies({
      getAssignment: vi.fn().mockResolvedValue({
        id: '123', name: 'Entrega de prueba', descriptionMarkdown: '', descriptionStatus: 'not_provided',
        attachments: [], url: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=123',
        submissionStatus: 'Enviado para calificar'
      })
    });
    const result = await prepare(deps);
    expect(result.status).toBe('rejected');
    expect(result.message).toMatch(/ya figura enviada/i);
    expect(fs.readdirSync((deps.store as unknown as { options: { directory: string } }).options.directory)).toHaveLength(0);
  });

  it('rejects a task Moodle explicitly marks closed', async () => {
    const deps = dependencies({
      getAssignment: vi.fn().mockResolvedValue({
        id: '123', name: 'Entrega de prueba', descriptionMarkdown: '', descriptionStatus: 'not_provided',
        attachments: [], url: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=123',
        submissionStatus: 'No se aceptan envíos'
      })
    });
    const result = await prepare(deps);
    expect(result.status).toBe('rejected');
    expect(result.message).toMatch(/está cerrada/i);
    expect(deps.getHtml).not.toHaveBeenCalled();
  });

  it('requires local approval, binds it to the exact plan, consumes it once, and delegates only the approved payload', async () => {
    const deps = dependencies({ enabled: true });
    const prepared = await prepare(deps);
    expect(prepared.status).toBe('prepared');
    const id = prepared.operation_id!;
    const pending = deps.store.getForHumanApproval(id);
    deps.store.approve(id, `APROBAR ${pending.fingerprint.slice(0, 12)}`);

    const executed = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: id }, deps);
    expect(executed.status).toBe('draft_saved');
    expect(deps.upload).toHaveBeenCalledWith(expect.objectContaining({
      assignmentId: '123',
      action: 'save_draft',
      textContent: '',
      attachments: [expect.objectContaining({ name: 'assignment-attachment.txt', sha256: 'a'.repeat(64) })]
    }));
    const duplicate = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: id }, deps);
    expect(duplicate.status).toBe('rejected');
    expect(deps.upload).toHaveBeenCalledTimes(1);
  });

  it('prepares and executes text-only submission only when Moodle exposes its online text field', async () => {
    const deps = dependencies({
      enabled: true,
      getHtml: vi.fn().mockImplementation(async (url: string) => url.includes('action=editsubmission') ? textForm : assignmentPage),
      upload: vi.fn().mockResolvedValue({ status: 'submitted', message: 'verified final submission', details: { verified: true } })
    });
    const exactText = 'Respuesta de prueba con\nuna segunda línea.';
    const prepared = await handleSubmitAssignment({ assignment_id: '123', text_content: exactText, submission_action: 'submit_final' }, deps);
    expect(prepared).toMatchObject({ status: 'prepared', details: { supports_online_text: true, supports_file_submission: false, action: 'submit_final' } });
    const id = prepared.operation_id!;
    const pending = deps.store.getForHumanApproval(id);
    deps.store.approve(id, `APROBAR ${pending.fingerprint.slice(0, 12)}`);
    const result = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: id }, deps);
    expect(result.status).toBe('submitted');
    expect(deps.upload).toHaveBeenCalledWith(expect.objectContaining({ textContent: exactText, attachments: [], action: 'submit_final' }));
  });

  it('rejects changed execution arguments without consuming the valid approval', async () => {
    const deps = dependencies({ enabled: true, getHtml: vi.fn().mockImplementation(async (url: string) => url.includes('action=editsubmission') ? textForm : assignmentPage) });
    const prepared = await handleSubmitAssignment({ assignment_id: '123', text_content: 'Texto aprobado' }, deps);
    const id = prepared.operation_id!;
    const pending = deps.store.getForHumanApproval(id);
    deps.store.approve(id, `APROBAR ${pending.fingerprint.slice(0, 12)}`);
    const changed = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: id, text_content: 'Texto distinto' }, deps);
    expect(changed.status).toBe('rejected');
    expect(changed.details).toMatchObject({ write_attempted: false });
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.store.getApprovedPlan(id).plan.textContent).toBe('Texto aprobado');
  });

  it('reports uncertain and consumes rather than retrying when the upload adapter throws', async () => {
    const upload = vi.fn().mockRejectedValue(new Error('network lost after request'));
    const deps = dependencies({ enabled: true, upload });
    const prepared = await prepare(deps);
    const id = prepared.operation_id!;
    const pending = deps.store.getForHumanApproval(id);
    deps.store.approve(id, `APROBAR ${pending.fingerprint.slice(0, 12)}`);
    const result = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: id }, deps);
    expect(result).toMatchObject({ status: 'uncertain', details: { write_attempted: true, approval_consumed: true } });
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('refuses to execute if the local file changed after the person approved it', async () => {
    const deps = dependencies({ enabled: true });
    const prepared = await prepare(deps);
    const id = prepared.operation_id!;
    const pending = deps.store.getForHumanApproval(id);
    deps.store.approve(id, `APROBAR ${pending.fingerprint.slice(0, 12)}`);
    const changed = vi.fn().mockImplementation(file => ({ ...file, sha256: 'b'.repeat(64), buffer: Buffer.from('changed') }));
    deps.loadAttachment = changed;
    const result = await handleSubmitAssignment({ assignment_id: '123', stage: 'execute', approval_id: id }, deps);
    expect(result.status).toBe('rejected');
    expect(result.message).toMatch(/cambiaron/i);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('rejects approval with a wrong challenge and expires pending and approved records', () => {
    const store = createStore();
    const plan = {
      assignmentId: '123', editUrl: 'https://campusvirtual.frm.utn.edu.ar/mod/assign/view.php?id=123&action=editsubmission',
      courseName: 'Curso', assignmentName: 'Tarea', action: 'save_draft' as const, textContent: '',
      attachments: [], supportsFileSubmission: true, supportsOnlineText: false
    };
    const operation = store.create(plan);
    expect(() => store.approve(operation.id, 'APROBAR incorrecto')).toThrow(/quedó rechazada/i);
    expect(() => store.getForHumanApproval(operation.id)).toThrow(/ya no está pendiente/i);

    let now = 1000;
    const expiring = new AssignmentApprovalStore({
      directory: fs.mkdtempSync(path.join(os.tmpdir(), 'utn-assignment-expiry-')),
      now: () => now,
      ttlMs: 20,
      approvalTtlMs: 20
    });
    tempDirs.push((expiring as unknown as { options: { directory: string } }).options.directory);
    const pending = expiring.create(plan);
    now += 21;
    expect(() => expiring.getForHumanApproval(pending.id)).toThrow(/venció/i);
    const approved = expiring.create(plan);
    const record = expiring.getForHumanApproval(approved.id);
    expiring.approve(approved.id, `APROBAR ${record.fingerprint.slice(0, 12)}`);
    now += 21;
    expect(() => expiring.getApprovedPlan(approved.id)).toThrow(/vigente/i);
  });
});
