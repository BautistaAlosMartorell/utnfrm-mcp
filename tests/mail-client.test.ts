import { beforeEach, describe, expect, it, vi } from 'vitest';

type Msg = { uid: number; envelope: { subject: string; date: Date; from: Array<{ address: string }> }; flags: Set<string> };

const { state, calls } = vi.hoisted(() => ({
  state: { folders: {} as Record<string, Array<{ uid: number; subject: string; date: string; seen: boolean }>>, moveResult: true as boolean },
  calls: { connected: 0, searches: [] as unknown[], moves: [] as Array<{ range: string; dest: string }>, flags: [] as Array<{ op: string; range: string; flags: string[] }>, locks: [] as Array<{ folder: string; readOnly: boolean }> }
}));

vi.mock('../src/session/credential-store.js', () => ({
  CredentialStore: { get: async () => ({ username: '1', password: 'x', email: 'yo@alumnos.example' }) }
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    mailbox: { exists: number } | false = false;
    private folder = '';
    on() { return this; }
    async connect() { calls.connected++; }
    close() { /* sin conexion real */ }
    async logout() { /* sin conexion real */ }
    async list() {
      return [{ path: 'INBOX', flags: new Set() }, { path: 'Trash', specialUse: '\\Trash', flags: new Set() }, ...Object.keys(state.folders).filter(name => !['INBOX', 'Trash'].includes(name)).map(path => ({ path, flags: new Set() }))];
    }
    async getMailboxLock(folder: string, options: { readOnly: boolean }) {
      if (!(folder in state.folders)) throw new Error('Command failed');
      calls.locks.push({ folder, readOnly: options.readOnly });
      this.folder = folder;
      this.mailbox = { exists: state.folders[folder].length };
      return { release() { /* nada */ } };
    }
    async search(query: unknown) { calls.searches.push(query); return state.folders[this.folder].map(message => message.uid); }
    async *fetch(range: string): AsyncGenerator<Msg> {
      const wanted = new Set(range.split(',').map(Number));
      for (const message of state.folders[this.folder]) {
        if (!wanted.has(message.uid)) continue;
        yield { uid: message.uid, envelope: { subject: message.subject, date: new Date(message.date), from: [{ address: 'a@b.c' }] }, flags: new Set(message.seen ? ['\\Seen'] : []) };
      }
    }
    async messageFlagsAdd(range: string, flags: string[]) { calls.flags.push({ op: 'add', range, flags }); return true; }
    async messageFlagsRemove(range: string, flags: string[]) { calls.flags.push({ op: 'remove', range, flags }); return true; }
    async messageMove(range: string, dest: string) { calls.moves.push({ range, dest }); return state.moveResult ? { path: this.folder, destination: dest } : false; }
  }
}));

const { searchMessages, moveToTrash, restoreFromTrash, setSeen } = await import('../src/mail/client.js');

beforeEach(() => {
  state.moveResult = true;
  state.folders = {
    INBOX: [{ uid: 1, subject: 'viejo', date: '2026-01-01T00:00:00Z', seen: true }, { uid: 2, subject: 'nuevo', date: '2026-10-01T00:00:00Z', seen: false }],
    Sent: [{ uid: 7, subject: 'enviado', date: '2026-05-01T00:00:00Z', seen: true }],
    Trash: [{ uid: 9, subject: 'ya borrado', date: '2026-03-01T00:00:00Z', seen: true }]
  };
  calls.connected = 0; calls.searches = []; calls.moves = []; calls.flags = []; calls.locks = [];
});

describe('searchMessages', () => {
  it('rejects an empty search before connecting to the server', async () => {
    await expect(searchMessages({ unseenOnly: false, limit: 10 })).rejects.toThrow(/al menos un criterio/);
    expect(calls.connected).toBe(0);
  });

  it('combines criteria in one query, searches every folder read-only, and sorts newest first', async () => {
    const hits = await searchMessages({ from: 'a', since: '2026-01-01', unseenOnly: true, limit: 10 });
    expect(calls.searches[0]).toEqual({ from: 'a', since: '2026-01-01', seen: false });
    expect(calls.locks.every(lock => lock.readOnly)).toBe(true);
    expect(new Set(calls.locks.map(lock => lock.folder))).toEqual(new Set(['INBOX', 'Trash', 'Sent']));
    expect(hits.map(hit => `${hit.folder}:${hit.uid}`)).toEqual(['INBOX:2', 'Sent:7', 'Trash:9', 'INBOX:1']);
  });

  it('honours the folder list and the limit', async () => {
    const hits = await searchMessages({ text: 'x', folders: ['INBOX', 'Sent'], unseenOnly: false, limit: 2 });
    expect(hits).toHaveLength(2);
    expect(hits.every(hit => hit.folder !== 'Trash')).toBe(true);
  });

  it('reports a missing folder in plain words', async () => {
    await expect(searchMessages({ text: 'x', folders: ['NoExiste'], unseenOnly: false, limit: 5 })).rejects.toThrow(/No existe la carpeta "NoExiste"/);
  });
});

describe('moveToTrash', () => {
  it('moves the found messages to Trash and reports the ones it did not find', async () => {
    const result = await moveToTrash({ folder: 'INBOX', uids: [1, 99] });
    expect(calls.moves).toEqual([{ range: '1', dest: 'Trash' }]);
    expect(result).toMatchObject({ trash: 'Trash', notFound: [99] });
    expect(result.moved.map(message => message.uid)).toEqual([1]);
    expect(calls.locks).toEqual([{ folder: 'INBOX', readOnly: false }]);
  });

  it('never deletes for good: refuses to act on the Trash folder itself', async () => {
    await expect(moveToTrash({ folder: 'trash', uids: [9] })).rejects.toThrow(/borrado definitivo no está habilitado/);
    expect(calls.moves).toEqual([]);
  });

  it('fails when none of the uids exist or the server refuses the move', async () => {
    await expect(moveToTrash({ folder: 'INBOX', uids: [404] })).rejects.toThrow(/No encontré ninguno/);
    state.moveResult = false;
    await expect(moveToTrash({ folder: 'INBOX', uids: [1] })).rejects.toThrow(/no pudo mover/);
  });
});

describe('restoreFromTrash', () => {
  it('moves messages from Trash back to the chosen folder', async () => {
    const result = await restoreFromTrash({ uids: [9, 99], to: 'INBOX' });
    expect(calls.moves).toEqual([{ range: '9', dest: 'INBOX' }]);
    expect(result).toMatchObject({ from: 'Trash', to: 'INBOX', notFound: [99] });
    expect(calls.locks).toEqual([{ folder: 'Trash', readOnly: false }]);
  });

  it('refuses Trash or an unknown folder as destination before touching anything', async () => {
    await expect(restoreFromTrash({ uids: [9], to: 'trash' })).rejects.toThrow(/no puede ser la Papelera/);
    await expect(restoreFromTrash({ uids: [9], to: 'Nada' })).rejects.toThrow(/No existe la carpeta "Nada"/);
    expect(calls.moves).toEqual([]);
  });
});

describe('setSeen', () => {
  it('only adds or removes the \\Seen flag on the messages it found', async () => {
    const unread = await setSeen({ folder: 'INBOX', uids: [2, 99], seen: true });
    expect(calls.flags).toEqual([{ op: 'add', range: '2', flags: ['\\Seen'] }]);
    expect(unread).toMatchObject({ notFound: [99] });
    expect(unread.updated).toMatchObject([{ uid: 2, seen: true }]);
    await setSeen({ folder: 'INBOX', uids: [1], seen: false });
    expect(calls.flags[1]).toEqual({ op: 'remove', range: '1', flags: ['\\Seen'] });
  });

  it('fails when none of the uids exist', async () => {
    await expect(setSeen({ folder: 'INBOX', uids: [404], seen: false })).rejects.toThrow(/No encontré ninguno/);
    expect(calls.flags).toEqual([]);
  });
});
