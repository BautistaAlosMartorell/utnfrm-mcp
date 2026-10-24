import fs from 'node:fs';

export type SessionFileInspection = { exists: false } | { exists: true; size: number };

/** Inspect without following links and reject files outside the bounded storage policy. */
export function inspectSessionFile(filePath: string, maxBytes: number): SessionFileInspection {
  let stats: fs.Stats;
  try {
    stats = fs.lstatSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false };
    throw new Error('No se pudo comprobar un archivo local de sesión.');
  }

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('El archivo de sesión no es un archivo regular.');
  }
  if (stats.size <= 0 || stats.size > maxBytes) {
    throw new Error('El archivo de sesión está vacío o supera el límite permitido.');
  }
  return { exists: true, size: stats.size };
}
