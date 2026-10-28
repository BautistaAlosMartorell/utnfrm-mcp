import { describe, expect, it, vi } from 'vitest';
import { checkServiceLogin, type ServiceLoginDeps } from '../src/session/service-logins.js';

const creds = { username: '1', password: 'x', email: 'a@b.c' };
function deps(overrides: Partial<ServiceLoginDeps> = {}): ServiceLoginDeps {
  return { credentials: async () => creds, verifyMail: vi.fn(async () => undefined), verifyAutogestion: vi.fn(async () => undefined), hasSession: async () => false, ...overrides };
}

describe('checkServiceLogin', () => {
  it('skips (not fails) without stored credentials and never tries to log in', async () => {
    const d = deps({ credentials: async () => null });
    expect(await checkServiceLogin('correo', d, { verify: true, browser: true })).toMatchObject({ status: 'skip' });
    expect(d.verifyMail).not.toHaveBeenCalled();
  });

  it('does not log in when verify is false', async () => {
    const d = deps();
    expect(await checkServiceLogin('autogestion', d, { verify: false, browser: true })).toMatchObject({ status: 'skip' });
    expect(d.verifyAutogestion).not.toHaveBeenCalled();
  });

  it('routes each service to its own verifier', async () => {
    const d = deps();
    expect((await checkServiceLogin('correo', d, { verify: true, browser: true })).status).toBe('ok');
    expect(d.verifyMail).toHaveBeenCalledTimes(1);
    expect(d.verifyAutogestion).not.toHaveBeenCalled();
    await checkServiceLogin('autogestion', d, { verify: true, browser: true });
    expect(d.verifyAutogestion).toHaveBeenCalledTimes(1);
  });

  it('verifies each service with the login cookies when there are no credentials, and skips the ones without cookies', async () => {
    const d = deps({ credentials: async () => null, hasSession: async service => service === 'autogestion' });
    expect(await checkServiceLogin('autogestion', d, { verify: true, browser: true })).toMatchObject({ status: 'ok', detail: expect.stringContaining('login') });
    expect(d.verifyAutogestion).toHaveBeenCalledTimes(1);
    expect(await checkServiceLogin('correo', d, { verify: true, browser: true })).toMatchObject({ status: 'skip' });
    expect(d.verifyMail).not.toHaveBeenCalled();
  });

  it('does not open a browser when browser is false, but still checks IMAP', async () => {
    const d = deps({ hasSession: async () => true });
    expect(await checkServiceLogin('autogestion', d, { verify: true, browser: false })).toMatchObject({ status: 'skip' });
    expect(d.verifyAutogestion).not.toHaveBeenCalled();
    expect(await checkServiceLogin('correo', d, { verify: true, browser: false })).toMatchObject({ status: 'ok' });
    const cookiesOnly = deps({ credentials: async () => null, hasSession: async () => true });
    expect(await checkServiceLogin('correo', cookiesOnly, { verify: true, browser: false })).toMatchObject({ status: 'skip' });
    expect(cookiesOnly.verifyMail).not.toHaveBeenCalled();
  });

  it('reports a rejected login as fail with the message', async () => {
    const d = deps({ verifyMail: async () => { throw new Error('No se pudo iniciar sesión en el correo: usuario o contraseña incorrectos.'); } });
    expect(await checkServiceLogin('correo', d, { verify: true, browser: true })).toMatchObject({ status: 'fail', detail: expect.stringContaining('incorrectos') });
  });
});
