const TERMINAL_CAMPUS_FAILURE = /autenticaci[oó]n|sesi[oó]n.*(?:expir|inv[aá]lida)|\b(?:401|403|429)\b|permisos|desaf[ií]o|bloqueo de seguridad|security challenge|solicitudes se detuvieron|no se volver[aá] a consultar|no se intentar[aá] evadir|cancelada por el cliente MCP/i;

/** Keep authentication, permission, throttle, challenge, and cancellation errors visible. */
export function rethrowTerminalCampusFailure(error: unknown): void {
  if (error instanceof Error && TERMINAL_CAMPUS_FAILURE.test(error.message)) throw error;
}
