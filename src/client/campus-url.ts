import { CAMPUS_ORIGIN } from '../config.js';

export function resolveCampusUrl(pathOrUrl: string, baseUrl = CAMPUS_ORIGIN): string {
  let url: URL;
  try {
    url = new URL(pathOrUrl, baseUrl);
  } catch {
    throw new Error('La URL del Campus no es válida.');
  }

  if (url.protocol !== 'https:' || url.origin !== CAMPUS_ORIGIN || url.username || url.password) {
    throw new Error('Acceso denegado: solo se permiten URLs HTTPS del Campus Virtual UTN Mendoza.');
  }

  return url.href;
}

export function isCampusLoginUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.origin === CAMPUS_ORIGIN && /^\/login\/index\.php\/?$/.test(parsed.pathname);
  } catch {
    return false;
  }
}
