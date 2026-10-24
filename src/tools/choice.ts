import { campusClient } from '../client/campus-client.js';
import { parseChoiceDetail } from '../parsers/choice.js';
import { ChoiceDetail } from '../types/index.js';
import { PATHS } from '../config.js';
import { requireMoodleId } from '../client/moodle-id.js';
import { writesDisabledResult } from '../client/write-policy.js';

export async function handleGetChoice(choiceIdOrUrl: string): Promise<ChoiceDetail> {
  const choiceId = requireMoodleId(choiceIdOrUrl);
  const url = PATHS.choiceView(choiceId);
  const html = await campusClient.getHtml(url);
  return parseChoiceDetail(html, url);
}

export interface SubmitChoiceInput {
  choice_id: string;
  option_id: string;
  confirm: boolean;
}

export async function handleSubmitChoice(input: SubmitChoiceInput): Promise<{
  status: 'preview' | 'success' | 'error';
  message: string;
  requires_confirmation?: boolean;
  action?: string;
  details?: Record<string, any>;
}> {
  const choiceId = requireMoodleId(input.choice_id);
  if (!/^\d{1,12}$/.test(input.option_id)) {
    return { status: 'error', message: 'El ID de opción debe ser numérico.' };
  }
  if (input.confirm) return writesDisabledResult();

  // 1. Obtener opciones actuales para verificar que la opción existe
  const currentChoice = await handleGetChoice(choiceId);
  const targetOption = currentChoice.options.find(o => o.id === input.option_id);

  if (!targetOption) {
    return {
      status: 'error',
      message: `La opción seleccionada (ID: ${input.option_id}) no existe en esta consulta. Opciones disponibles: ${currentChoice.options.map(o => `[ID: ${o.id}] ${o.text}`).join(', ')}`
    };
  }

  if (targetOption.selected) {
    return {
      status: 'success',
      message: 'Esta opción ya figura seleccionada en el Campus.',
      details: { choice_id: choiceId, option_id: input.option_id, verified: true, changed: false }
    };
  }

  if (currentChoice.hasAnswered && !currentChoice.canChangeAnswer) {
    return { status: 'error', message: 'El Campus no permite cambiar la respuesta registrada.' };
  }

  // Escritura deshabilitada: la herramienta solo puede devolver una vista previa.
  if (!input.confirm) {
    return {
      status: 'preview',
      requires_confirmation: false,
      action: 'Vista previa de elección; no se puede enviar desde el MCP',
      message: 'Vista previa únicamente. Este MCP no puede registrar elecciones; si querés responder, hacelo directamente en el Campus.',
      details: {
        choice_id: choiceId,
        choice_name: currentChoice.name,
        option_id: input.option_id,
        option_text: targetOption.text,
        already_answered: currentChoice.hasAnswered,
        write_attempted: false
      }
    };
  }

  // 3. Ejecución real
  let writeAttempted = false;
  try {
    const sesskey = await campusClient.getSesskey();
    const postData: Record<string, string> = {
      id: choiceId,
      sesskey,
      action: 'makechoice',
      answer: input.option_id
    };

    writeAttempted = true;
    const res = await campusClient.postForm('/mod/choice/view.php', postData);
    if (res.status < 200 || res.status >= 400) {
      throw new Error(`El Campus respondió HTTP ${res.status}; no se verificó el cambio.`);
    }
    const verified = await handleGetChoice(choiceId);
    const selected = verified.options.some(option => option.id === input.option_id && option.selected);
    if (!selected) {
      return {
        status: 'error',
        message: 'El Campus recibió la solicitud, pero la opción no aparece seleccionada. Revisá la consulta antes de reintentar.',
        details: { verified: false, mayHaveSucceeded: true }
      };
    }
    return {
      status: 'success',
      message: `Elección registrada y verificada: "${targetOption.text}".`,
      details: {
        choice_id: choiceId,
        option_id: input.option_id,
        option_text: targetOption.text,
        url: res.finalUrl,
        verified: true
      }
    };
  } catch (err: any) {
    return {
      status: 'error',
      message: writeAttempted
        ? 'No se pudo confirmar el resultado de la elección. No la repitas todavía: revisá primero el estado en el Campus.'
        : `Error al registrar elección: ${err.message || String(err)}`,
      ...(writeAttempted ? { details: { write_attempted: true, verified: false, mayHaveSucceeded: true } } : {})
    };
  }
}
