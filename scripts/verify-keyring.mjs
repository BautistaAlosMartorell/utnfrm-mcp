import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-mcp-keyring-check-'));
process.env.UTN_MCP_SESSION_DIR = sessionDir;

try {
  const { SessionStore } = await import('../dist/session/session-store.js');
  const state = {
    cookies: [{ name: 'ci-synthetic-cookie', value: 'never-write-this-in-plain-text', domain: 'campus.invalid', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }],
    origins: []
  };

  await SessionStore.save(state);
  const savedFile = SessionStore.getStoragePath();
  assert.equal(fs.existsSync(savedFile), true, 'encrypted session file is created');
  assert.equal(fs.readFileSync(savedFile, 'utf8').includes(state.cookies[0].value), false, 'session value is absent from disk');
  assert.deepEqual(await SessionStore.getPlaywrightStorageState(), state, 'OS key store key decrypts a session round trip');
  const sessionStoreUrl = new URL('../dist/session/session-store.js', import.meta.url).href;
  const childScript = `const { SessionStore } = await import(${JSON.stringify(sessionStoreUrl)}); const state = await SessionStore.getPlaywrightStorageState(); if (!Array.isArray(state.cookies) || state.cookies[0]?.name !== 'ci-synthetic-cookie') process.exitCode = 1;`;
  const secondProcess = spawnSync(process.execPath, ['--input-type=module', '-e', childScript], {
    encoding: 'utf8',
    env: process.env,
    timeout: 20000
  });
  if (secondProcess.error) throw secondProcess.error;
  assert.equal(secondProcess.status, 0, 'a new MCP process can reopen the system-protected session');
  await SessionStore.clear();
  assert.equal(SessionStore.exists(), false, 'logout removes the synthetic session');
  console.log(`Native session-store check passed on ${process.platform}.`);
} finally {
  delete process.env.UTN_MCP_SESSION_DIR;
  fs.rmSync(sessionDir, { recursive: true, force: true });
}
