import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampusClient } from '../src/client/campus-client.js';
import { campusRequestPolicy } from '../src/client/campus-request-policy.js';
import { SessionStore } from '../src/session/session-store.js';

type Internals = { adoptRenewedSession(): Promise<void>; contextSessionMs: number | undefined };

describe('CampusClient session renewal', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // El singleton de la política es compartido: se deja desbloqueado para los demás tests.
    campusRequestPolicy.clearAuthenticationBlockIfRenewed(Number.MAX_SAFE_INTEGER);
  });

  it('lifts an authentication block and drops stale contexts once the session is saved again', async () => {
    const client = new CampusClient();
    const internals = client as unknown as Internals;
    const close = vi.spyOn(client, 'close').mockResolvedValue();

    campusRequestPolicy.block('authentication');
    vi.spyOn(SessionStore, 'savedAt').mockReturnValue(new Date(Date.now() + 5000));

    await internals.adoptRenewedSession();

    expect(close).toHaveBeenCalledTimes(1);
    expect(() => campusRequestPolicy.assertAvailable()).not.toThrow();
  });

  it('keeps the block when the saved session is older than the block', async () => {
    const client = new CampusClient();
    const internals = client as unknown as Internals;
    const close = vi.spyOn(client, 'close').mockResolvedValue();

    campusRequestPolicy.block('authentication');
    vi.spyOn(SessionStore, 'savedAt').mockReturnValue(new Date(Date.now() - 3_600_000));

    await internals.adoptRenewedSession();

    expect(close).not.toHaveBeenCalled();
    expect(() => campusRequestPolicy.assertAvailable()).toThrow(/venci/i);
  });

  it('rebuilds open contexts when a newer session appears without any block', async () => {
    const client = new CampusClient();
    const internals = client as unknown as Internals;
    const close = vi.spyOn(client, 'close').mockResolvedValue();

    internals.contextSessionMs = 1000;
    vi.spyOn(SessionStore, 'savedAt').mockReturnValue(new Date(2000));

    await internals.adoptRenewedSession();

    expect(close).toHaveBeenCalledTimes(1);
  });
});
