import fs from 'node:fs';
import path from 'node:path';
import { SESSION_DIR } from '../config.js';

/**
 * Perfil local de materias del cuatrimestre: la lista de IDs que la persona está cursando ahora.
 * Sirve para que get_deadlines y get_announcements revisen solo esas (mucho más rápido que todas).
 * No contiene credenciales ni contenido del Campus; se guarda junto a la sesión, con permisos restringidos.
 */
function profilePath(): string {
  return path.join(process.env.UTN_MCP_PROFILE_DIR || SESSION_DIR, 'profile.json');
}

export function readActiveCourseIds(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(profilePath(), 'utf8')) as { activeCourseIds?: unknown };
    if (!Array.isArray(parsed.activeCourseIds)) return [];
    return [...new Set(parsed.activeCourseIds.filter((id): id is string => typeof id === 'string' && /^\d{1,12}$/.test(id)))];
  } catch {
    return [];
  }
}

export function writeActiveCourseIds(ids: string[]): void {
  const target = profilePath();
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, JSON.stringify({ version: 1, activeCourseIds: ids, updatedAt: new Date().toISOString() }), { mode: 0o600 });
  fs.renameSync(temporary, target);
}

export function clearActiveCourses(): void {
  fs.rmSync(profilePath(), { force: true });
}
