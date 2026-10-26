import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCourseSections } from '../src/parsers/course-contents.js';

const fixture = (name: string) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');

describe('parseCourseSections', () => {
  it('flags tile sections whose content was not rendered and keeps their titles', () => {
    const { courseName, sections } = parseCourseSections(fixture('course-tiles-main.html'));
    expect(courseName).toBe('Materia de Prueba');
    expect(sections.map(section => [section.number, section.name, section.rendered])).toEqual([
      [0, 'General', true],
      [1, 'Unidad 0', false],
      [2, 'Unidad 1', false]
    ]);
    expect(sections[0].activities).toMatchObject([{ id: '11', name: 'Avisos', type: 'forum', modname: 'forum' }]);
  });

  it('reads a single tile section page with typed activities and completion state', () => {
    const { sections } = parseCourseSections(fixture('course-tiles-section.html'));
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatchObject({ number: 2, name: 'Unidad 1', rendered: true, summary: 'Resumen de la unidad.' });
    expect(sections[0].activities.map(activity => [activity.type, activity.name, activity.completion])).toEqual([
      ['label', 'Teoría', 'pending'],
      ['resource', 'Apunte de clase', undefined],
      ['assignment', 'Entrega TP1', 'done'],
      ['external_url', 'Notebook', undefined]
    ]);
    expect(sections[0].activities[1].url).toBe('https://campusvirtual.frm.utn.edu.ar/mod/resource/view.php?id=21');
  });

  it('parses the topics format without screen-reader noise in section names', () => {
    const { sections } = parseCourseSections(fixture('course-topics.html'));
    expect(sections.map(section => [section.number, section.name, section.hidden])).toEqual([
      [0, 'General', undefined],
      [1, 'UNIDAD 1', undefined],
      [2, 'ARCHIVO', true]
    ]);
    expect(sections[1].activities[0]).toMatchObject({ type: 'folder', name: 'Apuntes', hidden: true });
    expect(sections[0].activities[0].url).toBe('https://campusvirtual.frm.utn.edu.ar/mod/forum/view.php?id=1');
  });
});
