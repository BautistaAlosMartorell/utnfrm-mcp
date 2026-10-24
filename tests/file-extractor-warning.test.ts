import { beforeEach, describe, expect, it, vi } from 'vitest';

const parser = vi.hoisted(() => ({ parseOffice: vi.fn(), generate: vi.fn() }));

vi.mock('officeparser', () => ({
  parseOffice: parser.parseOffice,
  OfficeGenerator: { generate: parser.generate }
}));

import { extractFileContent } from '../src/parsers/file-extractor.js';

describe('Office extraction warnings', () => {
  beforeEach(() => {
    parser.parseOffice.mockReset();
    parser.generate.mockReset();
  });

  it('marks processor-reported Office limitations as partial', async () => {
    parser.parseOffice.mockImplementation(async (_buffer, options) => {
      options.onWarning({ code: 'DOCX_PARTIAL_CONTENT', type: 'warning' });
      return {};
    });
    parser.generate.mockResolvedValue({ value: 'Some extracted content' });

    const result = await extractFileContent(
      Buffer.from('synthetic-office-file'),
      'document.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/document.docx'
    );

    expect(result.content).toContain('Some extracted content');
    expect(result.extractionStatus).toBe('partial');
    expect(result.extractionWarnings).toEqual([
      'El procesador detect\u00f3 una limitaci\u00f3n durante la extracci\u00f3n; el resultado puede estar incompleto.'
    ]);
  });
});
