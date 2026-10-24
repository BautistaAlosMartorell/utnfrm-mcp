import { describe, expect, it, vi } from 'vitest';
import { isCampusLoginUrl, resolveCampusUrl } from '../src/client/campus-url.js';
import { CAMPUS_ORIGIN } from '../src/config.js';
import { requireMoodleId } from '../src/client/moodle-id.js';
import { CampusClient } from '../src/client/campus-client.js';
import { withCampusOperationSignal } from '../src/client/campus-operation-context.js';

describe('Campus URL policy', () => {
  it('accepts relative and absolute HTTPS Campus URLs', () => {
    expect(resolveCampusUrl('/my/')).toBe(CAMPUS_ORIGIN + '/my/');
    expect(resolveCampusUrl(CAMPUS_ORIGIN + '/course/view.php?id=126'))
      .toBe(CAMPUS_ORIGIN + '/course/view.php?id=126');
  });

  it.each([
    'http://campusvirtual.frm.utn.edu.ar/my/',
    'https://campusvirtual.frm.utn.edu.ar.evil.test/my/',
    'https://campusvirtual.frm.utn.edu.ar@evil.test/my/',
    '//evil.test/my/',
    'javascript:alert(1)'
  ])('rejects unsafe Campus URL %s', value => {
    expect(() => resolveCampusUrl(value)).toThrow(/Acceso denegado|URL.*válida/);
  });

  it('recognizes only the Campus login route as an expired-session redirect', () => {
    expect(isCampusLoginUrl(CAMPUS_ORIGIN + '/login/index.php')).toBe(true);
    expect(isCampusLoginUrl(CAMPUS_ORIGIN + '/login/index.php/')).toBe(true);
    expect(isCampusLoginUrl(CAMPUS_ORIGIN + '/mod/forum/view.php?id=4')).toBe(false);
    expect(isCampusLoginUrl('https://evil.test/login/index.php')).toBe(false);
  });

  it('accepts numeric Moodle IDs from IDs or same-origin URLs only', () => {
    expect(requireMoodleId('126')).toBe('126');
    expect(requireMoodleId('/course/view.php?id=126')).toBe('126');
    expect(requireMoodleId(CAMPUS_ORIGIN + '/mod/forum/discuss.php?d=5963', 'd')).toBe('5963');
    expect(() => requireMoodleId('https://evil.test/course/view.php?id=126')).toThrow();
    expect(() => requireMoodleId('course 126')).toThrow();
  });

  it('rejects an off-campus redirect before issuing a follow-up request', async () => {
    const client = new CampusClient();
    const internal = client as unknown as {
      getRequestContext: () => Promise<unknown>;
      requestCampus: (method: 'GET' | 'POST', path: string) => Promise<unknown>;
    };
    const redirect = {
      status: () => 302,
      headers: () => ({ location: 'https://evil.test/collect' }),
      url: () => CAMPUS_ORIGIN + '/start'
    };
    const get = vi.fn().mockResolvedValue(redirect);
    vi.spyOn(internal, 'getRequestContext')
      .mockResolvedValue({ get } as unknown);
    await expect(internal.requestCampus('GET', '/start')).rejects.toThrow(/Acceso denegado/);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('follows a same-origin redirect manually', async () => {
    const client = new CampusClient();
    const internal = client as unknown as {
      getRequestContext: () => Promise<unknown>;
      requestCampus: (method: 'GET' | 'POST', path: string) => Promise<unknown>;
    };
    const first = {
      status: () => 302,
      headers: () => ({ location: '/next' }),
      url: () => CAMPUS_ORIGIN + '/start'
    };
    const final = {
      status: () => 200,
      headers: () => ({}),
      url: () => CAMPUS_ORIGIN + '/next'
    };
    const get = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(final);
    vi.spyOn(internal, 'getRequestContext')
      .mockResolvedValue({ get } as unknown);
    const result = await internal.requestCampus('GET', '/start');
    expect(get).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ response: final });
  });

  it('recreates the cached request context after canceling an active request', async () => {
    const client = new CampusClient();
    const internal = client as unknown as {
      apiContext: unknown;
      getRequestContext: () => Promise<unknown>;
      requestCampus: (method: 'GET' | 'POST', path: string) => Promise<{ response: unknown }>;
    };
    let markStarted!: () => void;
    let rejectRequest!: (error: Error) => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const firstContext = {
      get: vi.fn(() => new Promise<unknown>((_, reject) => {
        rejectRequest = reject;
        markStarted();
      })),
      dispose: vi.fn(async () => { rejectRequest(new Error('context disposed')); })
    };
    const finalResponse = {
      status: () => 200,
      headers: () => ({}),
      url: () => CAMPUS_ORIGIN + '/after-cancel'
    };
    const secondContext = {
      get: vi.fn().mockResolvedValue(finalResponse),
      dispose: vi.fn(async () => undefined)
    };
    const createContext = vi.fn(async () => {
      if (!internal.apiContext) internal.apiContext = createContext.mock.calls.length === 1 ? firstContext : secondContext;
      return internal.apiContext;
    });
    vi.spyOn(internal, 'getRequestContext').mockImplementation(createContext);

    const controller = new AbortController();
    const canceled = withCampusOperationSignal(controller.signal, () => internal.requestCampus('GET', '/during-cancel'));
    await started;
    controller.abort();
    await expect(canceled).rejects.toThrow(/cancelada por el cliente MCP/i);
    expect(firstContext.dispose).toHaveBeenCalledOnce();

    const nextResult = await internal.requestCampus('GET', '/after-cancel');
    expect(nextResult.response).toBe(finalResponse);
    expect(createContext).toHaveBeenCalledTimes(2);
    expect(secondContext.get).toHaveBeenCalledOnce();
  });
});
