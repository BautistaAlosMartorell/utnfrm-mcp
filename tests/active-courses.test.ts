import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listCourses = vi.hoisted(() => vi.fn());
vi.mock('../src/tools/list-courses.js', () => ({ handleListCourses: listCourses }));

import { resetCourseCache } from '../src/tools/course-ref.js';
import { handleSetActiveCourses, scopeCourses } from '../src/tools/active-courses.js';
import { readActiveCourseIds, writeActiveCourseIds } from '../src/session/profile.js';

const courses = [
  { id: '296', name: 'Ciencia de Datos', url: 'u' },
  { id: '126', name: 'Inteligencia Artificial', url: 'u' },
  { id: '752', name: 'Informática Industrial', url: 'u' }
];

describe('active courses profile', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-profile-'));
    process.env.UTN_MCP_PROFILE_DIR = dir;
    resetCourseCache();
    listCourses.mockReset();
    listCourses.mockResolvedValue({ courses, count: courses.length });
  });
  afterEach(() => {
    delete process.env.UTN_MCP_PROFILE_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts empty and tells the user how to set it up', async () => {
    const result = await handleSetActiveCourses({});
    expect(result).toMatchObject({ active: [], count: 0 });
    expect(result.message).toMatch(/set_active_courses/);
  });

  it('saves courses given by name or id, without duplicates, with private permissions', async () => {
    const result = await handleSetActiveCourses({ courses: ['ciencia de datos', '126', 'Inteligencia'] });
    expect(result.active.map(course => course.id)).toEqual(['296', '126']);
    expect(readActiveCourseIds()).toEqual(['296', '126']);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, 'profile.json')).mode & 0o777).toBe(0o600);
    const raw = fs.readFileSync(path.join(dir, 'profile.json'), 'utf8');
    expect(raw).not.toMatch(/Ciencia|cookie|token/i);
  });

  it('rejects courses the student is not enrolled in and leaves the profile untouched', async () => {
    await handleSetActiveCourses({ courses: ['296'] });
    await expect(handleSetActiveCourses({ courses: ['999'] })).rejects.toThrow(/no figura entre tus materias/);
    await expect(handleSetActiveCourses({ courses: ['quimica'] })).rejects.toThrow(/Ninguna materia coincide/);
    expect(readActiveCourseIds()).toEqual(['296']);
  });

  it('clears the profile', async () => {
    await handleSetActiveCourses({ courses: ['296'] });
    const cleared = await handleSetActiveCourses({ clear: true });
    expect(cleared.count).toBe(0);
    expect(readActiveCourseIds()).toEqual([]);
  });

  it('ignores a corrupted or hostile profile file', () => {
    fs.writeFileSync(path.join(dir, 'profile.json'), '{"activeCourseIds":["1","../../x",5,"2"]}');
    expect(readActiveCourseIds()).toEqual(['1', '2']);
    fs.writeFileSync(path.join(dir, 'profile.json'), 'no es json');
    expect(readActiveCourseIds()).toEqual([]);
  });

  it('scopes bulk tools to the profile unless all courses are requested', async () => {
    expect((await scopeCourses()).scope).toBe('todas');
    writeActiveCourseIds(['126']);
    const scoped = await scopeCourses();
    expect(scoped).toMatchObject({ scope: 'perfil', courses: [{ id: '126', name: 'Inteligencia Artificial' }] });
    expect((await scopeCourses(true)).courses).toHaveLength(3);
  });

  it('falls back to every course, with a warning, when the profile courses no longer exist', async () => {
    writeActiveCourseIds(['111', '222']);
    const scoped = await scopeCourses();
    expect(scoped.scope).toBe('todas');
    expect(scoped.courses).toHaveLength(3);
    expect(scoped.warning).toMatch(/set_active_courses/);
  });
});
