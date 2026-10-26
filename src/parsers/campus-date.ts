/**
 * Interpreta fechas del Campus (Moodle en español) y las devuelve como ISO 8601.
 * El Campus de UTN Mendoza opera en America/Argentina/Mendoza (UTC-03:00, sin horario de verano).
 */
export const CAMPUS_UTC_OFFSET = '-03:00';
const CAMPUS_UTC_OFFSET_MINUTES = -180;

const MONTHS: Record<string, number> = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, mar: 3, abril: 4, abr: 4,
  mayo: 5, may: 5, junio: 6, jun: 6, julio: 7, jul: 7, agosto: 8, ago: 8,
  septiembre: 9, setiembre: 9, sep: 9, sept: 9, octubre: 10, oct: 10,
  noviembre: 11, nov: 11, diciembre: 12, dic: 12
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toIso(year: number, month: number, day: number, hour: number, minute: number): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return undefined;
  // Valida que el día exista realmente (p. ej. 31 de abril).
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return undefined;
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${CAMPUS_UTC_OFFSET}`;
}

/** Convierte un epoch (segundos) de Moodle (`data-timestamp`) en ISO 8601 con la zona del Campus. */
export function epochToCampusIso(epochSeconds: number): string | undefined {
  if (!Number.isFinite(epochSeconds) || epochSeconds <= 0) return undefined;
  const shifted = new Date((epochSeconds + CAMPUS_UTC_OFFSET_MINUTES * 60) * 1000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:00${CAMPUS_UTC_OFFSET}`;
}

/**
 * Acepta formatos como:
 *  - "miércoles, 2 de septiembre de 2026, 23:59"
 *  - "mié, 21 de oct de 2026, 20:26"
 *  - "21 oct 2026" (sin hora: se toma 00:00)
 *  - "Hoy, 18:00" / "Mañana, 10:30" (relativo a `now`)
 *  - "2026-11-03 18:00" y "03/11/2026 18:00"
 * Devuelve undefined si no hay una fecha reconocible (por ejemplo "Sin fecha de cierre").
 */
export function parseCampusDate(text: string | undefined | null, now: Date = new Date()): string | undefined {
  if (!text) return undefined;
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  const time = clean.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const hour = time ? Number(time[1]) : 0;
  const minute = time ? Number(time[2]) : 0;

  const iso = clean.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]), hour, minute);

  const numeric = clean.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b/);
  if (numeric) return toIso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]), hour, minute);

  const verbose = clean.toLowerCase().match(/\b(\d{1,2})\s+(?:de\s+)?([a-záéíóú]+)\.?\s+(?:de\s+)?(\d{4})\b/);
  if (verbose) {
    const month = MONTHS[verbose[2].normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (month) return toIso(Number(verbose[3]), month, Number(verbose[1]), hour, minute);
  }

  const relative = clean.toLowerCase().match(/\b(hoy|mañana|ayer)\b/);
  if (relative) {
    const base = new Date(now.getTime() + CAMPUS_UTC_OFFSET_MINUTES * 60_000);
    const delta = relative[1] === 'mañana' ? 1 : relative[1] === 'ayer' ? -1 : 0;
    base.setUTCDate(base.getUTCDate() + delta);
    return toIso(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), hour, minute);
  }
  return undefined;
}

/** Días (fraccionarios, redondeados a 1 decimal) entre `now` y la fecha ISO; negativo si ya pasó. */
export function daysUntil(iso: string | undefined, now: Date = new Date()): number | undefined {
  if (!iso) return undefined;
  const target = Date.parse(iso);
  if (Number.isNaN(target)) return undefined;
  return Math.round(((target - now.getTime()) / 86_400_000) * 10) / 10;
}
