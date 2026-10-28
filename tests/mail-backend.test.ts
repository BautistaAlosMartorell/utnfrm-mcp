import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  class MailAuthError extends Error {}
  return {
    MailAuthError,
    credentials: vi.fn(),
    sessionExists: vi.fn(),
    imap: { listMessages: vi.fn(), searchMessages: vi.fn(), readMessage: vi.fn(), moveToTrash: vi.fn(), restoreFromTrash: vi.fn(), setSeen: vi.fn(), verifyMailLogin: vi.fn() },
    web: { listMessages: vi.fn(), searchMessages: vi.fn(), readMessage: vi.fn(), moveToTrash: vi.fn(), restoreFromTrash: vi.fn(), setSeen: vi.fn(), verify: vi.fn() }
  };
});
vi.mock('../src/session/credential-store.js', () => ({ CredentialStore: { get: h.credentials } }));
vi.mock('../src/session/session-store.js', () => ({ SessionStore: { exists: h.sessionExists } }));
vi.mock('../src/mail/client.js', () => ({ MailAuthError: h.MailAuthError, ...h.imap }));
vi.mock('../src/mail/webmail-client.js', () => ({ webmailClient: h.web }));

const { listMessages, setSeen, verifyMail } = await import('../src/mail/backend.js');
const withEmail = { username: '1', password: 'x', email: 'a@b.c' };
const input = { folder: 'INBOX', limit: 5, unseenOnly: false };

beforeEach(() => {
  vi.clearAllMocks();
  h.imap.listMessages.mockResolvedValue(['imap']);
  h.web.listMessages.mockResolvedValue(['web']);
  h.imap.verifyMailLogin.mockResolvedValue(undefined);
  h.web.verify.mockResolvedValue(undefined);
});

describe('mail backend', () => {
  it('uses IMAP when there are credentials with an email', async () => {
    h.credentials.mockResolvedValue(withEmail);
    h.sessionExists.mockReturnValue(true);
    expect(await listMessages(input)).toEqual(['imap']);
    expect(h.web.listMessages).not.toHaveBeenCalled();
  });

  it('goes straight to the Webmail with login cookies and no credentials', async () => {
    h.credentials.mockResolvedValue(null);
    h.sessionExists.mockReturnValue(true);
    expect(await listMessages(input)).toEqual(['web']);
    expect(h.imap.listMessages).not.toHaveBeenCalled();
  });

  it('falls back to the Webmail when IMAP rejects the password and there is a login session', async () => {
    h.credentials.mockResolvedValue(withEmail);
    h.sessionExists.mockReturnValue(true);
    h.imap.listMessages.mockRejectedValue(new h.MailAuthError('usuario o contraseña incorrectos'));
    expect(await listMessages(input)).toEqual(['web']);
  });

  it('does not fall back for network errors, and keeps the IMAP error without cookies', async () => {
    h.credentials.mockResolvedValue(withEmail);
    h.sessionExists.mockReturnValue(true);
    h.imap.listMessages.mockRejectedValue(new Error('No se pudo conectar con el servidor de correo de la facultad.'));
    await expect(listMessages(input)).rejects.toThrow(/No se pudo conectar/);
    h.sessionExists.mockReturnValue(false);
    h.imap.listMessages.mockRejectedValue(new h.MailAuthError('usuario o contraseña incorrectos'));
    await expect(listMessages(input)).rejects.toThrow(/incorrectos/);
    expect(h.web.listMessages).not.toHaveBeenCalled();
  });

  it('explains both ways in when there is nothing, and also covers writes and verify', async () => {
    h.credentials.mockResolvedValue(null);
    h.sessionExists.mockReturnValue(false);
    await expect(listMessages(input)).rejects.toThrow(/setup-wizard.*login/);
    h.sessionExists.mockReturnValue(true);
    h.web.setSeen.mockResolvedValue({ updated: [], notFound: [] });
    await setSeen({ folder: 'INBOX', uids: [1], seen: true });
    expect(h.web.setSeen).toHaveBeenCalledTimes(1);
    await verifyMail();
    expect(h.web.verify).toHaveBeenCalledTimes(1);
  });
});
