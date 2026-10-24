import { requireMoodleId } from '../client/moodle-id.js';
import { handleGetAssignment } from './get-assignment.js';
import { campusClient } from '../client/campus-client.js';
import { PATHS } from '../config.js';
import { findAssignmentEditUrl, parseAssignmentUploadContract } from '../client/moodle-assignment-form.js';
import {
  hashAssignmentAttachments,
  loadAssignmentAttachment,
  prepareAssignmentAttachments,
  uploadAndSubmitAssignmentFiles,
  type AssignmentUploadResult
} from '../client/moodle-assignment-uploader.js';
import { ASSIGNMENT_SUBMISSIONS_ENABLED } from '../client/assignment-submission-policy.js';
import { AssignmentApprovalStore, assignmentApprovalStore, type AssignmentSubmissionPlan } from '../session/assignment-approval-store.js';
import type { z } from 'zod';
import { SubmitAssignmentInputSchema } from '../types/index.js';
type SubmitAssignmentInput = z.input<typeof SubmitAssignmentInputSchema>;

type AssignmentSnapshot = Awaited<ReturnType<typeof handleGetAssignment>>;

export interface AssignmentSubmissionDependencies {
  getAssignment: typeof handleGetAssignment;
  getHtml: typeof campusClient.getHtml;
  store: AssignmentApprovalStore;
  enabled: boolean;
  hashAttachments: typeof hashAssignmentAttachments;
  loadAttachment: typeof loadAssignmentAttachment;
  upload: typeof uploadAndSubmitAssignmentFiles;
}

const defaults: AssignmentSubmissionDependencies = {
  getAssignment: handleGetAssignment,
  getHtml: campusClient.getHtml.bind(campusClient),
  store: assignmentApprovalStore,
  enabled: ASSIGNMENT_SUBMISSIONS_ENABLED,
  hashAttachments: hashAssignmentAttachments,
  loadAttachment: loadAssignmentAttachment,
  upload: uploadAndSubmitAssignmentFiles
};

function closedOrSubmitted(snapshot: AssignmentSnapshot): string | undefined {
  const status = `${snapshot.submissionStatus || ''} ${snapshot.gradingStatus || ''}`;
  if (/submitted for grading|enviado para calificar|entregad[oa]\s+(?:para|definitiv)|submission status:\s*submitted/i.test(status) && !/no entregado/i.test(status)) {
    return 'La tarea ya figura enviada formalmente. Para evitar duplicados, no se inició otra entrega.';
  }
  if (/no se aceptan env[ií]os|submission period is over|submission closed|actividad cerrada|tarea cerrada|not accepting submissions/i.test(status)) {
    return 'Moodle indica que la tarea está cerrada para nuevas entregas.';
  }
  return undefined;
}

function constraintsError(plan: AssignmentSubmissionPlan): string | undefined {
  const files = plan.attachments;
  if (files.length && !plan.supportsFileSubmission) return 'El formulario actual no admite adjuntos.';
  if (plan.textContent && !plan.supportsOnlineText) return 'El formulario actual no admite texto en línea.';
  if (plan.maxFiles !== undefined && files.length > plan.maxFiles) return `El formulario admite como máximo ${plan.maxFiles} archivos.`;
  for (const file of files) {
    if (plan.maxFileBytes !== undefined && file.size > plan.maxFileBytes) return `El archivo ${file.name} supera el máximo indicado por Moodle.`;
    if (plan.allowedFileTypes?.length) {
      const extension = file.name.includes('.') ? `.${file.name.split('.').pop()!.toLowerCase()}` : '';
      const mimeExtensions: Record<string, string[]> = {
        'application/pdf': ['.pdf'],
        'application/msword': ['.doc'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
        'application/vnd.ms-excel': ['.xls'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
        'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
        'text/plain': ['.txt', '.text'],
        'image/jpeg': ['.jpg', '.jpeg'],
        'image/png': ['.png'],
        'image/gif': ['.gif']
      };
      const allowed = plan.allowedFileTypes.some(type => {
        const normalized = type.trim().toLowerCase();
        return normalized === '*' || normalized === '*/*' || normalized === extension || normalized === `*${extension}` ||
          (mimeExtensions[normalized]?.includes(extension) ?? false);
      });
      if (!allowed) return `El formulario de Moodle no declara permitido el tipo de archivo ${extension || '(sin extensión)'}.`;
    }
  }
  return undefined;
}

async function readCurrentPlan(
  assignmentId: string,
  action: AssignmentSubmissionPlan['action'],
  textContent: string,
  attachments: AssignmentSubmissionPlan['attachments'],
  deps: AssignmentSubmissionDependencies
): Promise<{ plan?: AssignmentSubmissionPlan; error?: string }> {
  const assignment = await deps.getAssignment(assignmentId);
  const closed = closedOrSubmitted(assignment);
  if (closed) return { error: closed };

  const assignmentHtml = await deps.getHtml(PATHS.assignView(assignmentId));
  const editUrl = findAssignmentEditUrl(assignmentHtml, assignmentId);
  if (!editUrl) return { error: 'Moodle no ofrece actualmente un control “Agregar entrega” o “Editar entrega”.' };
  const editHtml = await deps.getHtml(editUrl);
  const contract = parseAssignmentUploadContract(editHtml);
  if (!contract) return { error: 'El formulario actual no expone un campo de archivo ni texto compatible con esta herramienta.' };

  const plan: AssignmentSubmissionPlan = {
    assignmentId,
    editUrl,
    courseName: assignment.courseName || 'Materia no informada por Moodle',
    assignmentName: assignment.name,
    dueDate: assignment.dueDate,
    currentSubmissionStatus: assignment.submissionStatus,
    currentLastModified: assignment.lastModified,
    action,
    textContent,
    attachments,
    supportsFileSubmission: Boolean(contract.fileManagerField),
    supportsOnlineText: Boolean(contract.textField),
    maxFiles: contract.maxFiles,
    maxFileBytes: contract.maxFileBytes,
    allowedFileTypes: contract.allowedFileTypes
  };
  const constraintError = constraintsError(plan);
  return constraintError ? { error: constraintError } : { plan };
}

function rejected(message: string, details: Record<string, unknown> = {}) {
  return { status: 'rejected' as const, message, details: { write_attempted: false, ...details } };
}

export async function handleSubmitAssignment(
  input: SubmitAssignmentInput,
  deps: AssignmentSubmissionDependencies = defaults
): Promise<{
  status: 'prepared' | AssignmentUploadResult['status'] | 'rejected';
  message: string;
  operation_id?: string;
  fingerprint?: string;
  expires_at?: string;
  details?: Record<string, unknown>;
}> {
  let assignmentId: string;
  try {
    assignmentId = requireMoodleId(input.assignment_id);
  } catch (error) {
    return rejected(error instanceof Error ? error.message : 'ID de tarea no válido.');
  }
  const stage = input.stage || 'prepare';
  const action = input.submission_action || 'save_draft';
  const textContent = input.text_content || '';
  const attachmentPaths = input.attachment_paths || [];

  if (textContent.length > 100000) return rejected('El texto supera el máximo local de 100000 caracteres.');

  if (stage === 'execute') {
    if (!deps.enabled) return rejected('Las entregas desde MCP están deshabilitadas localmente. La aprobación no autoriza esta operación mientras siga apagada la política independiente.');
    if (!input.approval_id) return rejected('Para ejecutar se necesita el ID aprobado desde una terminal local interactiva.');
    if (textContent || attachmentPaths.length || input.submission_action) {
      return rejected('En stage=execute no se aceptan contenido ni rutas nuevos: se usa exclusivamente la operación aprobada.');
    }
    let approved: ReturnType<AssignmentApprovalStore['getApprovedPlan']>;
    try {
      approved = deps.store.getApprovedPlan(input.approval_id);
    } catch (error) {
      return rejected(error instanceof Error ? error.message : 'No hay una aprobación local vigente.');
    }
    if (approved.plan.assignmentId !== assignmentId) return rejected('El ID de tarea no coincide con la operación aprobada.');

    try {
      const freshFiles = approved.plan.attachments.map(file => deps.loadAttachment({ path: file.path, name: file.name, size: file.size }));
      const current = await readCurrentPlan(
        assignmentId,
        approved.plan.action,
        approved.plan.textContent,
        freshFiles.map(({ path, name, size, sha256 }) => ({ path, name, size, sha256 })),
        deps
      );
      if (!current.plan) return rejected(current.error || 'No se pudo validar la tarea actual.');
      const consumed = deps.store.consume(input.approval_id, current.plan);
      try {
        const result = await deps.upload({
          assignmentId,
          editUrl: consumed.editUrl,
          attachments: freshFiles,
          textContent: consumed.textContent,
          action: consumed.action
        });
        return { ...result, details: { ...result.details, approval_consumed: true } };
      } catch {
        return {
          status: 'uncertain',
          message: 'La aprobación se consumió y el adaptador de Moodle terminó sin resultado. No se reintentó; verificá el estado de la tarea antes de actuar.',
          details: { write_attempted: true, verified: false, approval_consumed: true }
        };
      }
    } catch (error) {
      return rejected(error instanceof Error ? error.message : 'Falló la validación previa a la entrega.');
    }
  }

  if (input.approval_id) return rejected('No incluyas approval_id al preparar una operación nueva.');
  if (!textContent && attachmentPaths.length === 0) return rejected('Indicá al menos un archivo o texto para la entrega.');

  try {
    const files = await deps.hashAttachments(prepareAssignmentAttachments(attachmentPaths));
    const current = await readCurrentPlan(
      assignmentId,
      action,
      textContent,
      files.map(({ path, name, size, sha256 }) => ({ path, name, size, sha256 })),
      deps
    );
    if (!current.plan) return rejected(current.error || 'No se pudo inspeccionar el formulario actual.');
    const created = deps.store.create(current.plan);
    return {
      status: 'prepared',
      operation_id: created.id,
      fingerprint: created.fingerprint,
      expires_at: new Date(created.expiresAt).toISOString(),
      message: deps.enabled
        ? 'Operación preparada sin modificar Moodle. Revisala y aprobala con `approve:assignment <id>` en una terminal local interactiva; luego ejecutá stage=execute.'
        : 'Operación preparada sin modificar Moodle. La entrega permanece deshabilitada por política local; no se puede ejecutar ni aprobar mientras esa protección continúe apagada.',
      details: {
        assignment_id: assignmentId,
        course_name: current.plan.courseName,
        assignment_name: current.plan.assignmentName,
        due_date: current.plan.dueDate || 'No informada',
        current_submission_status: current.plan.currentSubmissionStatus || 'No informado',
        action,
        text_content: current.plan.textContent,
        attachments: current.plan.attachments.map(file => ({ name: file.name, size_bytes: file.size, sha256: file.sha256 })),
        supports_file_submission: current.plan.supportsFileSubmission,
        supports_online_text: current.plan.supportsOnlineText,
        max_files: current.plan.maxFiles,
        max_file_bytes: current.plan.maxFileBytes,
        allowed_file_types: current.plan.allowedFileTypes,
        local_execution_enabled: deps.enabled,
        write_attempted: false
      }
    };
  } catch (error) {
    return rejected(error instanceof Error ? error.message : 'No se pudo preparar la operación local.');
  }
}
