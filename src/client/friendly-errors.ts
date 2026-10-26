import { sanitizeCampusErrorMessage } from './error-sanitizer.js';

const GENERIC = 'No se pudo completar el comando. Revisá la sesión y los permisos del Campus.';

/**
 * Traduce errores técnicos frecuentes a una causa y una acción concretas.
 * El texto siempre pasa por el sanitizador: nunca expone cookies, tokens ni URLs del Campus.
 */
export function describeCliError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!raw) return GENERIC;

  if (/Executable doesn't exist|browserType\.launch|npx playwright install|Looks like Playwright was just installed/i.test(raw)) {
    return 'Falta el navegador Chromium que usa este MCP (o es de otra versión). Ejecutá `utn-mcp-mendoza install-browser` y volvé a intentar. ' +
      'En Linux, si pide dependencias del sistema, usá `utn-mcp-mendoza install-browser --with-deps` (requiere sudo).';
  }
  if (/Missing X server|\$DISPLAY|no DISPLAY|headed browser without having a XServer/i.test(raw)) {
    return 'No hay un entorno gráfico disponible para abrir el navegador de inicio de sesión. Ejecutá `login` desde una sesión de escritorio.';
  }
  if (/secret-tool|libsecret|keyring|Secret Service|org\.freedesktop\.secrets/i.test(raw)) {
    return 'No se pudo usar el almacén seguro de contraseñas del sistema. En Linux instalá `libsecret-tools` y `gnome-keyring`, ' +
      'y ejecutá el comando desde una sesión gráfica con el almacén desbloqueado.';
  }
  if (/UTN_MCP_[A-Z_]+ debe ser/i.test(raw)) {
    return sanitizeCampusErrorMessage(raw);
  }
  return sanitizeCampusErrorMessage(raw) || GENERIC;
}

/** Detalle técnico (pila de llamadas) solo con UTN_MCP_DEBUG=1; siempre sanitizado línea por línea. */
export function debugErrorDetails(error: unknown): string | undefined {
  if (process.env.UTN_MCP_DEBUG !== '1') return undefined;
  const stack = error instanceof Error ? error.stack || error.message : String(error);
  return stack.split(/\r?\n/).map(line => line.replace(/https?:\/\/[^\s)]+/gi, '[URL del Campus]').slice(0, 300)).join('\n');
}
