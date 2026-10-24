export const ASSIGNMENT_SUBMISSIONS_ENABLED = process.env.UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED === 'true';

export function assertAssignmentSubmissionsEnabled(): void {
  if (!ASSIGNMENT_SUBMISSIONS_ENABLED) {
    throw new Error('Las entregas MCP están deshabilitadas hasta una prueba supervisada y su habilitación explícita local.');
  }
}
