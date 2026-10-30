import { describe, expect, it } from 'vitest';
import { mergeStorageState } from '../src/session/auth.js';

const cookie = (name: string, domain: string, value: string) => ({ name, domain, value, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' as const });

describe('mergeStorageState', () => {
  it('keeps Webmail and Autogestión cookies when the Campus session is renewed', () => {
    const previous = { cookies: [cookie('MoodleSession', 'campus', 'old'), cookie('roundcube_sessid', 'alumnos', 'mail')], origins: [] };
    const fresh = { cookies: [cookie('MoodleSession', 'campus', 'new')], origins: [] };
    const merged = mergeStorageState(previous, fresh);
    expect(merged.cookies.map(c => `${c.name}=${c.value}`).sort()).toEqual(['MoodleSession=new', 'roundcube_sessid=mail']);
  });
  it('returns the fresh state when nothing was saved', () => {
    const fresh = { cookies: [cookie('a', 'x', '1')], origins: [] };
    expect(mergeStorageState(undefined, fresh)).toEqual(fresh);
  });
});
