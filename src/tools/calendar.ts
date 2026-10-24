import { campusClient } from '../client/campus-client.js';
import { parseCalendarEvents } from '../parsers/calendar.js';
import { CalendarEventItem } from '../types/index.js';
import { PATHS } from '../config.js';
import { requireMoodleId } from '../client/moodle-id.js';
import { writesDisabledResult } from '../client/write-policy.js';

export async function handleListCalendarEvents(daysAhead: number = 30): Promise<{
  events: CalendarEventItem[];
  count: number;
  period: string;
}> {
  if (!Number.isInteger(daysAhead) || daysAhead < 1 || daysAhead > 3650) {
    throw new Error('days_ahead debe ser un entero entre 1 y 3650.');
  }
  const html = await campusClient.getHtml(`${PATHS.calendarUpcoming}&timeahead=${daysAhead}`);
  const events = parseCalendarEvents(html);

  return {
    events,
    count: events.length,
    period: `Próximos ${daysAhead} días`
  };
}

export interface CalendarAddEventInput {
  name: string;
  description?: string;
  date: string;
  course_id?: string;
  confirm: boolean;
}

export async function handleCalendarAddEvent(input: CalendarAddEventInput): Promise<{
  status: 'preview' | 'success' | 'error';
  message: string;
  requires_confirmation?: boolean;
  action?: string;
  details?: Record<string, any>;
}> {
  const eventDate = new Date(input.date);
  if (!input.date.trim() || Number.isNaN(eventDate.getTime())) {
    return { status: 'error', message: 'La fecha debe tener un formato de fecha y hora válido.' };
  }
  if (eventDate.getTime() <= Date.now()) {
    return { status: 'error', message: 'La fecha del evento debe ser futura.' };
  }
  const courseId = input.course_id ? requireMoodleId(input.course_id) : undefined;
  if (input.confirm) return writesDisabledResult();

  // Escritura deshabilitada: la herramienta solo puede devolver una vista previa.
  if (!input.confirm) {
    return {
      status: 'preview',
      requires_confirmation: false,
      action: 'Vista previa de recordatorio; no se puede guardar desde el MCP',
      message: 'Vista previa únicamente. Este MCP no puede crear eventos; si querés guardarlo, hacelo directamente en el Campus.',
      details: {
        name: input.name,
        date: input.date,
        description: input.description,
        course_id: courseId || 'Personal / Usuario',
        write_attempted: false
      }
    };
  }

  // 2. Ejecución real
  let writeAttempted = false;
  try {
    const formHtml = await campusClient.getHtml(`${PATHS.calendarEvent}?action=new`);
    if (!/name=["']name["']/i.test(formHtml)) {
      throw new Error('El Campus no mostró un formulario autorizado para crear eventos.');
    }
    const verificationDays = Math.min(3650, Math.max(30, Math.ceil((eventDate.getTime() - Date.now()) / 86400000) + 2));
    const before = await handleListCalendarEvents(verificationDays);
    const previousCount = before.events.filter(event => event.name.trim() === input.name.trim()).length;
    const sesskey = await campusClient.getSesskey();
    const timestamp = Math.floor(eventDate.getTime() / 1000);

    const postData: Record<string, string> = {
      sesskey,
      action: 'new',
      name: input.name,
      'description[text]': input.description || '',
      'description[format]': '1',
      eventtype: courseId ? 'course' : 'user',
      courseid: courseId || '1',
      timestart: String(timestamp),
      submitbutton: 'Guardar cambios'
    };

    writeAttempted = true;
    const res = await campusClient.postForm(PATHS.calendarEvent, postData);
    if (res.status < 200 || res.status >= 400) {
      throw new Error(`El Campus respondió HTTP ${res.status}; el evento no se verificó.`);
    }
    const after = await handleListCalendarEvents(verificationDays);
    const eventCount = after.events.filter(event => event.name.trim() === input.name.trim()).length;
    if (eventCount <= previousCount) {
      return {
        status: 'error',
        message: 'El Campus recibió la solicitud, pero el recordatorio nuevo no aparece en el calendario. Revisá antes de volver a intentar.',
        details: { verified: false, mayHaveSucceeded: true }
      };
    }
    return {
      status: 'success',
      message: 'Recordatorio creado y verificado en tu calendario de Moodle.',
      details: {
        name: input.name,
        date: input.date,
        url: res.finalUrl,
        verified: true
      }
    };
  } catch (err: any) {
    return {
      status: 'error',
      message: writeAttempted
        ? 'No se pudo confirmar el resultado del evento. No lo crees de nuevo todavía: revisá primero el calendario del Campus.'
        : `Error al crear evento en calendario: ${err.message || String(err)}`,
      ...(writeAttempted ? { details: { write_attempted: true, verified: false, mayHaveSucceeded: true } } : {})
    };
  }
}
