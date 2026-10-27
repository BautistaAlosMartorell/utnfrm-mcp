import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { selectSections } from '../src/tools/get-course-contents.js';
import { buildOutline, handleStudyPack, type StudyPackDeps } from '../src/tools/study-pack.js';
import type { CourseContentsResult } from '../src/tools/get-course-contents.js';

const pdf = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'tabla-sintetica.pdf'));
const A = (id: string, name: string, type: string, url?: string) => ({ id, name, type, modname: type, url: url ?? `https://campusvirtual.frm.utn.edu.ar/mod/${type}/view.php?id=${id}` });

const unitFour: CourseContentsResult = {
  courseId: '752', courseName: 'Informática de Prueba', sectionCount: 1, activityCount: 6,
  sections: [{
    number: 5, name: 'UNIDAD 4 - PLANIFICACIÓN', summary: 'Resumen',
    activities: [
      { ...A('1', 'Teoría', 'label'), description: 'Leer antes de clase' },
      A('2', 'Apunte', 'resource'),
      A('3', 'Carpeta de apuntes', 'folder'),
      A('4', 'Consigna TP', 'page'),
      A('5', 'Notebook', 'external_url'),
      A('6', 'Autoevaluación', 'quiz')
    ]
  }]
};

function deps(overrides: Partial<StudyPackDeps> = {}): StudyPackDeps & { download: ReturnType<typeof vi.fn> } {
  return {
    contents: vi.fn(async () => unitFour),
    download: vi.fn(async () => ({ buffer: pdf, filename: 'apunte.pdf', contentType: 'application/pdf', finalUrl: 'x' })),
    getHtml: vi.fn(async (url: string) => url.includes('folder')
      ? '<a href="https://campusvirtual.frm.utn.edu.ar/pluginfile.php/8/mod_folder/content/0/uno.pdf">uno</a><a href="https://campusvirtual.frm.utn.edu.ar/pluginfile.php/8/mod_folder/content/0/dos.pdf">dos</a>'
      : '<html><body><div class="page-content"><h2>Consigna</h2><p>Entregar el viernes.</p></div></body></html>'),
    readExternal: vi.fn(async () => ({ kind: 'notebook' as const, host: 'raw.githubusercontent.com', finalPath: '/o/r/main/clase.ipynb', contentMarkdown: '# Clase\n\ntexto', characters: 14, truncated: false })),
    now: () => 0,
    ...overrides
  } as never;
}

describe('unit selection', () => {
  const sections = [
    { number: 0, name: 'General', activities: [], rendered: true },
    { number: 4, name: 'Unidad 3', activities: [], rendered: true },
    { number: 5, name: 'Unidad 4', activities: [], rendered: true },
    { number: 6, name: 'UNIDAD 10 - Cierre', activities: [], rendered: true },
    { number: 7, name: 'Tema 2: Redes', activities: [], rendered: true }
  ];
  it('reads a bare number as "Unidad N", not as the internal section number', () => {
    expect(selectSections(sections as never, '4').map(section => section.name)).toEqual(['Unidad 4']);
    expect(selectSections(sections as never, '3').map(section => section.name)).toEqual(['Unidad 3']);
    expect(selectSections(sections as never, '10').map(section => section.name)).toEqual(['UNIDAD 10 - Cierre']);
    expect(selectSections(sections as never, '2').map(section => section.name)).toEqual(['Tema 2: Redes']);
  });
  it('falls back to the internal number and to names', () => {
    expect(selectSections(sections as never, '0').map(section => section.name)).toEqual(['General']);
    expect(selectSections(sections as never, 'cierre').map(section => section.name)).toEqual(['UNIDAD 10 - Cierre']);
    expect(() => selectSections(sections as never, 'xyz')).toThrow(/Secciones disponibles/);
  });
});

describe('buildOutline', () => {
  it('takes the first meaningful line of each page and drops repeated headers', () => {
    const pages = [1, 2, 3, 4, 5].map(n => `### Página ${n} / 5\nInformática Industrial · Unidad 4\nTema número ${n}\ntexto ${n}\n\n---\n`).join('');
    const outline = buildOutline('Apunte', pages);
    expect(outline.map(topic => [topic.page, topic.topic])).toEqual([[1, 'Tema número 1'], [2, 'Tema número 2'], [3, 'Tema número 3'], [4, 'Tema número 4'], [5, 'Tema número 5']]);
  });
  it('skips table rows and uses Markdown headings for text without pages', () => {
    expect(buildOutline('A', '### Página 1 / 1\n| a | b |\n| --- | --- |\nTítulo real').map(topic => topic.topic)).toEqual(['Título real']);
    expect(buildOutline('Notebook', '# Intro\ntexto\n## Parte 1\n').map(topic => topic.topic)).toEqual(['Intro', 'Parte 1']);
  });
});

describe('study_pack', () => {
  it('reads files, folders, pages and external links, and reports coverage', async () => {
    const d = deps();
    const result = await handleStudyPack({ course_id: 'informatica', unit: '4' }, d);
    expect(d.contents).toHaveBeenCalledWith('informatica', '4');
    expect(result.unit).toMatchObject({ number: 5, name: 'UNIDAD 4 - PLANIFICACIÓN' });
    expect(result.notes).toEqual(['Leer antes de clase']);
    expect(result.sources.map(source => [source.title, source.status])).toEqual([
      ['Apunte', 'complete'],
      ['Carpeta de apuntes / uno.pdf', 'complete'],
      ['Carpeta de apuntes / dos.pdf', 'complete'],
      ['Consigna TP', 'complete'],
      ['Notebook', 'complete'],
      ['Autoevaluación', 'skipped']
    ]);
    expect(result.coverage).toEqual({ total: 6, complete: 5, partial: 0, unreadable: 0, skipped: 1 });
    expect(result.sources[0].content).toContain('| Emisión planeada |  | 250 |  | 250 |');
    expect(result.sources[3].content).toContain('Entregar el viernes.');
    expect(result.sources[4].content).toContain('# Clase');
    expect(result.outline.some(topic => topic.source === 'Apunte' && topic.page === 1)).toBe(true);
    expect(result.partial).toBeUndefined();
    expect(result.guidance).toMatch(/outline/);
  });

  it('returns only the index when include_content is false', async () => {
    const result = await handleStudyPack({ course_id: 'x', unit: '4', include_content: false }, deps());
    expect(result.sources.every(source => source.content === undefined)).toBe(true);
    expect(result.sources[0].characters).toBeGreaterThan(0);
    expect(result.outline.length).toBeGreaterThan(0);
  });

  it('skips external links on request and marks unreadable ones without failing the pack', async () => {
    const skipped = await handleStudyPack({ course_id: 'x', unit: '4', include_external: false }, deps());
    expect(skipped.sources.find(source => source.title === 'Notebook')).toMatchObject({ status: 'skipped' });
    const failing = await handleStudyPack({ course_id: 'x', unit: '4' }, deps({ readExternal: vi.fn(async () => { throw new Error('El sitio ejemplo.com no está en la lista'); }) }));
    expect(failing.sources.find(source => source.title === 'Notebook')).toMatchObject({ status: 'unreadable', warnings: [expect.stringContaining('lista')] });
    expect(failing.coverage.unreadable).toBe(1);
  });

  it('keeps going when one file cannot be downloaded, but not on a lost session', async () => {
    let calls = 0;
    const flaky = deps({ download: vi.fn(async () => { calls += 1; if (calls === 1) throw new Error('HTTP 500'); return { buffer: pdf, filename: 'a.pdf', contentType: 'application/pdf', finalUrl: 'x' }; }) });
    const result = await handleStudyPack({ course_id: 'x', unit: '4' }, flaky);
    expect(result.sources[0]).toMatchObject({ title: 'Apunte', status: 'unreadable' });
    expect(result.sources[1].status).toBe('complete');
    await expect(handleStudyPack({ course_id: 'x', unit: '4' }, deps({ download: vi.fn(async () => { throw new Error('La sesión del Campus Virtual expiró.'); }) }))).rejects.toThrow(/expiró/);
  });

  it('truncates by source and by total budget, and says so', async () => {
    const result = await handleStudyPack({ course_id: 'x', unit: '4', max_chars_per_source: 1000, max_total_chars: 5000 }, deps());
    const apunte = result.sources[0];
    expect(apunte.content!.length).toBeLessThan(apunte.characters + 200);
    const tight = await handleStudyPack({ course_id: 'x', unit: '4', max_total_chars: 5000, max_chars_per_source: 3000 }, deps({ readExternal: vi.fn(async () => ({ kind: 'text' as const, host: 'h', finalPath: '/a', contentMarkdown: 'x'.repeat(9000), characters: 9000, truncated: false })) }));
    const external = tight.sources.find(source => source.title === 'Notebook')!;
    expect(external.truncated).toBe(true);
    expect(tight.totals.includedCharacters).toBeLessThanOrEqual(5000);
  });

  it('stops reading when the time budget runs out and flags the pack as partial', async () => {
    let clock = 0;
    const d = deps({
      now: () => clock,
      download: vi.fn(async () => { clock += 60_000; return { buffer: pdf, filename: 'a.pdf', contentType: 'application/pdf', finalUrl: 'x' }; })
    });
    const result = await handleStudyPack({ course_id: 'x', unit: '4' }, d);
    expect(result.partial).toBe(true);
    expect(result.sources.some(source => source.status === 'skipped' && /presupuesto de tiempo/.test(source.warnings.join(' ')))).toBe(true);
  });

  it('warns when the unit selector is ambiguous and fails when nothing matches', async () => {
    const two = { ...unitFour, sections: [unitFour.sections[0], { ...unitFour.sections[0], number: 6, name: 'UNIDAD 4 - Extra' }] };
    const result = await handleStudyPack({ course_id: 'x', unit: '4' }, deps({ contents: vi.fn(async () => two) }));
    expect(result.warnings.join(' ')).toMatch(/coincide con 2 secciones/);
    await expect(handleStudyPack({ course_id: 'x', unit: '9' }, deps({ contents: vi.fn(async () => ({ ...unitFour, sections: [] })) }))).rejects.toThrow(/No se encontró la unidad/);
  });
});
