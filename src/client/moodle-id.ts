import { CAMPUS_ORIGIN } from '../config.js';

export function requireMoodleId(value: string, parameter = 'id'): string {
  const candidate = value.trim();
  if (/^\d{1,12}$/.test(candidate)) return candidate;

  let url: URL;
  try {
    url = new URL(candidate, CAMPUS_ORIGIN);
  } catch {
    throw new Error('Se esperaba un ID numérico de Moodle o una URL válida del Campus.');
  }

  if (url.origin !== CAMPUS_ORIGIN || url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('El identificador debe pertenecer al Campus Virtual UTN Mendoza.');
  }

  const id = url.searchParams.get(parameter);
  if (!id || !/^\d{1,12}$/.test(id)) {
    throw new Error(`La URL debe incluir un valor numérico válido en ${parameter}.`);
  }
  return id;
}
