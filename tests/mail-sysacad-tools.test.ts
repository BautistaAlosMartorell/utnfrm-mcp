import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mail, sysacad } = vi.hoisted(() => ({
  mail: { moveToTrash: vi.fn(async () => ({})), restoreFromTrash: vi.fn(async () => ({})), setSeen: vi.fn(async () => ({})), listMessages: vi.fn(async () => []), searchMessages: vi.fn(async () => []), readMessage: vi.fn(async () => ({})) },
  sysacad: { consultar: vi.fn(), inscripcionHtml: vi.fn() }
}));

vi.mock('../src/mail/client.js', () => mail);
vi.mock('../src/sysacad/client.js', () => ({ sysacadClient: sysacad }));

const mailTools = await import('../src/tools/mail.js');
const sysacadTools = await import('../src/tools/sysacad.js');
const { CONSULTAS } = await import('../src/sysacad/consultas.js');

beforeEach(() => vi.clearAllMocks());

describe('mail tool handlers', () => {
  it('drop repeated uids before moving, restoring or marking', async () => {
    await mailTools.handleMailDeleteMessages({ folder: 'INBOX', uids: [3, 3, 4] });
    await mailTools.handleMailRestoreMessages({ uids: [5, 5], folder: 'INBOX' });
    await mailTools.handleMailSetSeen({ folder: 'INBOX', uids: [6, 6, 7], seen: false });
    expect(mail.moveToTrash).toHaveBeenCalledWith({ folder: 'INBOX', uids: [3, 4] });
    expect(mail.restoreFromTrash).toHaveBeenCalledWith({ uids: [5], to: 'INBOX' });
    expect(mail.setSeen).toHaveBeenCalledWith({ folder: 'INBOX', uids: [6, 7], seen: false });
  });

  it('map the snake_case inputs to the client options', async () => {
    await mailTools.handleMailSearch({ from: 'campus', unseen_only: true, limit: 5 });
    expect(mail.searchMessages).toHaveBeenCalledWith(expect.objectContaining({ from: 'campus', unseenOnly: true, limit: 5 }));
    expect(await mailTools.handleMailListMessages({ folder: 'Sent', limit: 3, unseen_only: false })).toEqual({ folder: 'Sent', messages: [] });
  });
});

describe('Sysacad tool handlers', () => {
  it('only offers read-only consultas from the closed catalog', () => {
    for (const consulta of Object.values(CONSULTAS)) {
      expect(['ver', 'manpet']).toContain(consulta.kind);
      expect(consulta.t).toMatch(/^\d+$/);
    }
    expect(Object.keys(CONSULTAS).join(' ')).not.toMatch(/inscri|encuesta|beca|titulo/i);
  });

  it('parses the page of a consulta and labels it', async () => {
    sysacad.consultar.mockResolvedValue('<body>No se encuentran datos de aplazos.</body>');
    const result = await sysacadTools.handleSysacadConsultar({ consulta: 'aplazos' });
    expect(result).toMatchObject({ consulta: 'aplazos', label: CONSULTAS.aplazos.label, message: 'No se encuentran datos para esta consulta.' });
  });

  it('reports a closed enrollment and refuses an unrecognised screen', async () => {
    sysacad.inscripcionHtml.mockResolvedValue('<body>No se puede inscribir a cursar en la especialidad X.</body>');
    expect(await sysacadTools.handleSysacadInscripcionEstado({})).toMatchObject({ abierta: false });
    sysacad.inscripcionHtml.mockResolvedValue('<body>nada</body>');
    await expect(sysacadTools.handleSysacadInscripcionEstado({})).rejects.toThrow(/No reconocí la pantalla/);
  });
});
