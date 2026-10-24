import fs from 'node:fs';
import path from 'node:path';

const MAX_TRAINEDDATA_BYTES = 100 * 1024 * 1024;

export type LocalOcrConfigResult =
  | { available: true; language: string; langPath: string }
  | { available: false; warning: string };

/** OCR may only use language data already installed on this machine. */
export function resolveLocalOcrConfig(
  requested: boolean,
  env: NodeJS.ProcessEnv = process.env
): LocalOcrConfigResult {
  if (!requested) return { available: false, warning: '' };

  const langPath = env.UTN_MCP_TESSDATA_DIR?.trim();
  if (!langPath) {
    return {
      available: false,
      warning: 'Se solicitó OCR, pero falta configurar UTN_MCP_TESSDATA_DIR con una carpeta local de modelos Tesseract; no se consultaron recursos externos.'
    };
  }

  const language = (env.UTN_MCP_OCR_LANGUAGE || 'spa').trim();
  const languages = language.split('+');
  if (!languages.length || languages.some(code => !/^[a-z0-9_]{2,16}$/i.test(code))) {
    return {
      available: false,
      warning: 'El idioma configurado para OCR no tiene un formato válido; no se consultaron recursos externos.'
    };
  }

  let directory: fs.Stats;
  const absolutePath = path.resolve(langPath);
  try {
    directory = fs.lstatSync(absolutePath);
  } catch {
    return {
      available: false,
      warning: 'La carpeta local de datos OCR no está disponible; no se consultaron recursos externos.'
    };
  }
  if (!directory.isDirectory() || directory.isSymbolicLink()) {
    return {
      available: false,
      warning: 'La ruta local de datos OCR no es una carpeta regular; no se consultaron recursos externos.'
    };
  }

  for (const code of languages) {
    const modelPath = path.join(absolutePath, `${code}.traineddata.gz`);
    try {
      const model = fs.lstatSync(modelPath);
      if (!model.isFile() || model.isSymbolicLink() || model.size <= 0 || model.size > MAX_TRAINEDDATA_BYTES) {
        throw new Error('invalid model file');
      }
    } catch {
      return {
        available: false,
        warning: 'Faltan modelos Tesseract locales para el idioma solicitado o exceden el límite permitido; no se consultaron recursos externos.'
      };
    }
  }

  return { available: true, language, langPath: absolutePath };
}
