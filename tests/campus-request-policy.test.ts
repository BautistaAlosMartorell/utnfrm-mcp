import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CampusRequestPolicy, isReadOnlyCampusPost } from '../src/client/campus-request-policy.js';

const courseCatalogReadFixture = readFileSync(
  fileURLToPath(new URL('./fixtures/course-catalog-read-only-ajax.json', import.meta.url)),
  'utf8'
);

describe('Campus request policy', () => {
  it('keeps Campus concurrency fixed at one to isolate cancellation', () => {
    expect(() => new CampusRequestPolicy({ maxConcurrent: 2, minIntervalMs: 0, maxQueued: 1 }))
      .toThrow(/concurrencia.*fijada en 1/i);
  });

  it('limits concurrent work and bounds the waiting queue', async () => {
    const policy = new CampusRequestPolicy({ maxConcurrent: 1, minIntervalMs: 0, maxQueued: 1 });
    let finishFirst!: () => void;
    const first = policy.run(() => new Promise<string>(resolve => {
      finishFirst = () => resolve('first');
    }));
    await Promise.resolve();
    const second = policy.run(async () => 'second');
    await Promise.resolve();

    expect(policy.queuedCount).toBe(1);
    await expect(policy.run(async () => 'overflow')).rejects.toThrow(/límite local/i);
    finishFirst();
    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(policy.queuedCount).toBe(0);
  });

  it('removes a canceled queued request without running it', async () => {
    const policy = new CampusRequestPolicy({ maxConcurrent: 1, minIntervalMs: 0, maxQueued: 1 });
    let finishFirst!: () => void;
    const first = policy.run(() => new Promise<string>(resolve => {
      finishFirst = () => resolve('first');
    }));
    await Promise.resolve();
    const controller = new AbortController();
    const operation = vi.fn(async () => 'must not run');
    const second = policy.run(operation, controller.signal);
    const secondResult = expect(second).rejects.toThrow(/cancelada por el cliente MCP/i);

    controller.abort();
    await secondResult;
    expect(policy.queuedCount).toBe(0);
    finishFirst();
    await expect(first).resolves.toBe('first');
    expect(operation).not.toHaveBeenCalled();
  });

  it('enforces the configured minimum interval between request starts', async () => {
    vi.useFakeTimers();
    try {
      const policy = new CampusRequestPolicy({ maxConcurrent: 1, minIntervalMs: 250, maxQueued: 1 });
      await policy.run(async () => undefined);
      let started = false;
      const second = policy.run(async () => { started = true; });

      await vi.advanceTimersByTimeAsync(249);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await second;
      expect(started).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops the session after an authentication, authorization, throttle, or challenge signal', async () => {
    const policy = new CampusRequestPolicy({ maxConcurrent: 1, minIntervalMs: 0, maxQueued: 0 });
    await policy.run(async () => 'before');
    policy.block('rate-limit');

    await expect(policy.run(async () => 'after')).rejects.toThrow(/HTTP 429/i);
  });

  it('allows only known Moodle read-only POST endpoints through browser navigation', () => {
    const ajaxUrl = new URL('https://campusvirtual.frm.utn.edu.ar/lib/ajax/service.php');
    const readPayload = JSON.stringify([{ methodname: 'core_courseformat_get_state' }]);
    const writePayload = JSON.stringify([{ methodname: 'core_user_update_user_preferences' }]);

    expect(isReadOnlyCampusPost(ajaxUrl, courseCatalogReadFixture)).toBe(true);
    expect(isReadOnlyCampusPost(ajaxUrl, readPayload)).toBe(true);
    expect(isReadOnlyCampusPost(ajaxUrl, writePayload)).toBe(false);
    expect(isReadOnlyCampusPost(ajaxUrl, JSON.stringify([{ methodname: 'core_course_edit_module' }]))).toBe(false);
    expect(isReadOnlyCampusPost(ajaxUrl, 'invalid')).toBe(false);
    expect(isReadOnlyCampusPost(new URL('https://campusvirtual.frm.utn.edu.ar/mod/forum/post.php'), readPayload)).toBe(false);
  });
});
