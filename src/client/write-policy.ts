export const CAMPUS_WRITES_ENABLED = false;

export function assertCampusWritesEnabled(): void {
  if (!CAMPUS_WRITES_ENABLED) {
    throw new Error('Las escrituras al Campus están deshabilitadas: STDIO no ofrece una aprobación humana independiente asociada a esta acción.');
  }
}

export function writesDisabledResult(): {
  status: 'error';
  message: string;
  details: { write_attempted: false; writes_enabled: false; approval_required: 'independent-human' };
} {
  return {
    status: 'error',
    message: 'Esta operación no se ejecutó: las escrituras al Campus están deshabilitadas hasta contar con una aprobación humana independiente y vinculada a los datos exactos.',
    details: {
      write_attempted: false,
      writes_enabled: false,
      approval_required: 'independent-human'
    }
  };
}
