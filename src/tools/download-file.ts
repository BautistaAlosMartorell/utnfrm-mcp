import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { campusClient } from '../client/campus-client.js';
import { safeLocalFilename } from '../client/campus-links.js';

export interface DownloadFileInput {
  url: string;
  filename?: string;
}

export interface DownloadFileResult {
  path: string;
  filename: string;
  bytes: number;
  contentType: string;
}

/** Carpeta de descargas del MCP. Solo se escribe aquí: la herramienta no acepta rutas de destino arbitrarias. */
export function downloadDirectory(): string {
  const configured = process.env.UTN_MCP_DOWNLOAD_DIR;
  if (configured) {
    if (!path.isAbsolute(configured)) throw new Error('UTN_MCP_DOWNLOAD_DIR debe ser una ruta absoluta.');
    return configured;
  }
  return path.join(os.homedir(), 'Downloads', 'utn-mcp');
}

function uniqueTarget(directory: string, filename: string): { fd: number; target: string } {
  const parsed = path.parse(filename);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? filename : `${parsed.name} (${attempt})${parsed.ext}`;
    const target = path.join(directory, candidate);
    try {
      // 'wx' falla si el archivo ya existe: nunca se sobrescribe ni se sigue un enlace simbólico preexistente.
      return { fd: fs.openSync(target, 'wx', 0o600), target };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
  throw new Error('No se pudo elegir un nombre libre para el archivo descargado.');
}

/** Descarga un archivo del Campus a la carpeta de descargas local (sin sobrescribir) y devuelve su ruta. */
export async function handleDownloadFile(input: DownloadFileInput): Promise<DownloadFileResult> {
  const download = await campusClient.downloadBuffer(input.url);
  const requested = input.filename ? safeLocalFilename(input.filename) : safeLocalFilename(download.filename);
  const directory = downloadDirectory();
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const { fd, target } = uniqueTarget(directory, requested);
  try {
    fs.writeSync(fd, download.buffer);
  } finally {
    fs.closeSync(fd);
  }
  return {
    path: target,
    filename: path.basename(target),
    bytes: download.buffer.length,
    contentType: download.contentType
  };
}
