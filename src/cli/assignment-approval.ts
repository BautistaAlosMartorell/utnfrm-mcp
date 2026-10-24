import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { assignmentApprovalStore } from '../session/assignment-approval-store.js';
import { ASSIGNMENT_SUBMISSIONS_ENABLED } from '../client/assignment-submission-policy.js';

export interface ApprovalConsole {
  input: NodeJS.ReadableStream;
  output: NodeJS.WritableStream;
  interactive: boolean;
}

function write(output: NodeJS.WritableStream, text: string): void {
  output.write(text);
}

export async function approveAssignmentInConsole(
  id: string,
  consoleIo: ApprovalConsole = { input: stdin, output: stdout, interactive: Boolean(stdin.isTTY && stdout.isTTY) }
): Promise<void> {
  if (!ASSIGNMENT_SUBMISSIONS_ENABLED) {
    throw new Error('Las entregas desde MCP están deshabilitadas. Una aprobación local no habilita escrituras.');
  }
  if (!consoleIo.interactive) {
    throw new Error('La aprobación requiere una terminal local interactiva; no se acepta desde la sesión STDIO del agente.');
  }

  const { plan, fingerprint, expiresAt } = assignmentApprovalStore.getForHumanApproval(id);
  write(consoleIo.output, '\nREVISIÓN LOCAL DE ENTREGA — Moodle no se modificará hasta que apruebes aquí.\n');
  write(consoleIo.output, `Materia: ${plan.courseName}\nActividad: ${plan.assignmentName} (ID ${plan.assignmentId})\n`);
  write(consoleIo.output, `Efecto: ${plan.action === 'submit_final' ? 'guardar borrador y enviar formalmente' : 'guardar como borrador sin envío formal'}\n`);
  write(consoleIo.output, `Fecha límite observada: ${plan.dueDate || 'no informada por Moodle'}\n`);
  write(consoleIo.output, `Estado observado al preparar: ${plan.currentSubmissionStatus || 'no informado por Moodle'}\n`);
  write(consoleIo.output, `Huella SHA-256 de la operación: ${fingerprint}\n`);
  write(consoleIo.output, `Preparación vence: ${new Date(expiresAt).toLocaleString()}\n`);
  write(consoleIo.output, `Archivos (${plan.attachments.length}):\n`);
  for (const file of plan.attachments) {
    write(consoleIo.output, `  - ${file.path}\n    nombre=${file.name}; bytes=${file.size}; SHA-256=${file.sha256}\n`);
  }
  if (plan.textContent) {
    write(consoleIo.output, '\nTexto exacto que se enviaría:\n');
    write(consoleIo.output, `${plan.textContent}\n`);
  }
  write(consoleIo.output, '\nEsta aprobación será de un solo uso y vencerá en 2 minutos.\n');

  const rl = readline.createInterface({ input: consoleIo.input, output: consoleIo.output, terminal: true });
  try {
    const answer = await rl.question(`Para aprobar, escribe exactamente: APROBAR ${fingerprint.slice(0, 12)}\n> `);
    if (answer.trim() !== `APROBAR ${fingerprint.slice(0, 12)}`) {
      assignmentApprovalStore.reject(id);
      write(consoleIo.output, 'Operación rechazada; no se guardó una aprobación.\n');
      return;
    }
    const approval = assignmentApprovalStore.approve(id, answer.trim());
    write(consoleIo.output, `Aprobación local válida hasta ${new Date(approval.approvalExpiresAt).toLocaleString()}.\n`);
    write(consoleIo.output, `Volvé al cliente MCP y ejecutá submit_assignment con stage=execute y approval_id=${id}.\n`);
  } finally {
    rl.close();
  }
}
