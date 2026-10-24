import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { extractFileContent, selectPdfPageText } from '../src/parsers/file-extractor.js';

const docxFixture = () => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fixture DOCX phrase</w:t></w:r></w:p><w:sectPr/></w:body></w:document>')
});

const xlsxFixture = () => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  'xl/workbook.xml': strToU8('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sample" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
  'xl/worksheets/sheet1.xml': strToU8('<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Column</t></is></c><c r="B1" t="inlineStr"><is><t>Value</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Fixture row</t></is></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>')
});

const odtFixture = () => zipSync({
  mimetype: strToU8('application/vnd.oasis.opendocument.text'),
  'content.xml': strToU8('<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>Fixture ODT phrase</text:p></office:text></office:body></office:document-content>')
}, { level: 0 });

const odsFixture = () => zipSync({
  mimetype: strToU8('application/vnd.oasis.opendocument.spreadsheet'),
  'content.xml': strToU8('<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Sample"><table:table-row><table:table-cell office:value-type="string"><text:p>Fixture ODS phrase</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>')
}, { level: 0 });

const epubFixture = () => zipSync({
  mimetype: strToU8('application/epub+zip'),
  'META-INF/container.xml': strToU8('<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'),
  'OEBPS/content.opf': strToU8('<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="BookId">fixture</dc:identifier><dc:title>Fixture</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>'),
  'OEBPS/chapter.xhtml': strToU8('<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Fixture EPUB phrase</h1></body></html>')
}, { level: 0 });

const pptxFixture = () => zipSync({
  '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>'),
  '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>'),
  'ppt/presentation.xml': strToU8('<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>'),
  'ppt/_rels/presentation.xml.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'),
  'ppt/slides/slide1.xml': strToU8('<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Fixture PPTX phrase</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>')
});

const pdfFixture = (phrase = 'Fixture PDF phrase') => {
  const stream = `BT /F1 18 Tf 20 100 Td ${[...phrase].map(character => `(${character}) Tj`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let output = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossReferenceOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return Buffer.from(output, 'ascii');
};

const multiPagePdfFixture = (phrases: string[]) => {
  const pageRefs = phrases.map((_, index) => `${3 + index * 2} 0 R`).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageRefs}] /Count ${phrases.length} >>`
  ];
  for (const [index, phrase] of phrases.entries()) {
    const pageId = 3 + index * 2;
    const contentId = pageId + 1;
    const stream = `BT /F1 18 Tf 20 100 Td (${phrase}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 ${3 + phrases.length * 2} 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(stream, 'ascii')} >>\nstream\n${stream}\nendstream`
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let output = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output, 'ascii'));
    output += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const crossReferenceOffset = Buffer.byteLength(output, 'ascii');
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) output += `${String(offset).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${crossReferenceOffset}\n%%EOF`;
  return Buffer.from(output, 'ascii');
};

describe('file extraction limits and pagination', () => {
  it('pages long text files by bounded character fragments', async () => {
    const source = 'A'.repeat(600) + 'B'.repeat(600);
    const first = await extractFileContent(
      Buffer.from(source),
      'notes.txt',
      'text/plain',
      'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/notes.txt',
      { page: 1, pageSize: 512 }
    );
    const second = await extractFileContent(
      Buffer.from(source),
      'notes.txt',
      'text/plain',
      'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/notes.txt',
      { page: 2, pageSize: 512 }
    );

    expect(first.totalPages).toBe(3);
    expect(first.currentPage).toBe(1);
    expect(first.content.startsWith('A')).toBe(true);
    expect(second.currentPage).toBe(2);
    expect(second.content.startsWith('A')).toBe(true);
    expect(second.content.length).toBeLessThanOrEqual(512 + 64);
  });

  it('caps a requested fragment size', async () => {
    const result = await extractFileContent(
      Buffer.from('plain text'),
      'notes.txt',
      'text/plain',
      'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/notes.txt',
      { pageSize: 1000000 }
    );
    expect(result.pageSize).toBe(20000);
  });

  it('returns continuable bounded fragments for PDFs', async () => {
    const args = [Buffer.from(pdfFixture('A'.repeat(700))), 'sample.pdf', 'application/pdf', 'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/sample'] as const;
    const first = await extractFileContent(...args, { pageSize: 256 });
    const second = await extractFileContent(...args, { pageSize: 256, offset: 10 });

    expect(first.contentLength).toBeGreaterThan(10);
    expect(second.currentOffset).toBe(10);
    expect(second.content).not.toBe(first.content);

    const selectedPage = await extractFileContent(...args, { page: 1 });
    expect(selectedPage.currentPage).toBe(1);
    expect(selectedPage.content).toContain('A'.repeat(20));
  }, 20_000);

  it('extracts all pages from a synthetic multi-page PDF and preserves page references', async () => {
    const phrases = Array.from({ length: 6 }, (_, index) => (`PAGE${String(index + 1).padStart(2, '0')} `).repeat(18));
    const args = [
      multiPagePdfFixture(phrases),
      'multi-page.pdf',
      'application/pdf',
      'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/multi-page.pdf'
    ] as const;
    const first = await extractFileContent(...args, { pageSize: 256 });
    expect(first.totalPages).toBe(6);
    expect(first.truncated).toBe(true);
    expect(first.nextOffset).toBeDefined();

    const remaining = await extractFileContent(...args, { pageSize: 20000, offset: first.nextOffset });
    const complete = first.content.split('\n\n... [Contenido parcial. Continuar con offset=')[0] + remaining.content;
    expect(complete).toContain('PAGE01');
    expect(complete).toContain('PAGE03');
    expect(complete).toContain('PAGE06');
    expect(complete.match(/### Página/g)).toHaveLength(6);

    const sixth = await extractFileContent(...args, { page: 6 });
    expect(sixth.currentPage).toBe(6);
    expect(sixth.content).toContain('PAGE06');
  }, 20_000);

  it('selects OCR text for a page whose digital text layer is empty', () => {
    const selected = selectPdfPageText(
      [{ text: 'digital text', metadata: { pageNumber: 1 } }, { text: '', metadata: { pageNumber: 2 } }],
      2,
      ['recognized page one', 'recognized scanned page two']
    );
    expect(selected).toBe('recognized scanned page two');
  });

  it('keeps OCR opt-in and reports when local models are unavailable', async () => {
    const originalDirectory = process.env.UTN_MCP_TESSDATA_DIR;
    delete process.env.UTN_MCP_TESSDATA_DIR;
    try {
      const result = await extractFileContent(
        Buffer.from(pdfFixture()),
        'sample.pdf',
        'application/pdf',
        'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/sample',
        { ocr: true }
      );
      expect(result.ocrPerformed).toBe(false);
      expect(result.extractionWarnings.join(' ')).toContain('UTN_MCP_TESSDATA_DIR');
    } finally {
      if (originalDirectory === undefined) delete process.env.UTN_MCP_TESSDATA_DIR;
      else process.env.UTN_MCP_TESSDATA_DIR = originalDirectory;
    }
  });

  it.each([
    { filename: 'sample.docx', contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: docxFixture(), format: 'docx', phrase: 'Fixture DOCX phrase' },
    { filename: 'sample.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsxFixture(), format: 'xlsx', phrase: 'Fixture row' },
    { filename: 'sample.odt', contentType: 'application/vnd.oasis.opendocument.text', buffer: odtFixture(), format: 'odt', phrase: 'Fixture ODT phrase' },
    { filename: 'sample.ods', contentType: 'application/vnd.oasis.opendocument.spreadsheet', buffer: odsFixture(), format: 'ods', phrase: 'Fixture ODS phrase' },
    { filename: 'sample.rtf', contentType: 'application/rtf', buffer: Buffer.from('{\\rtf1\\ansi Fixture RTF phrase}'), format: 'rtf', phrase: 'Fixture RTF phrase' },
    { filename: 'sample.epub', contentType: 'application/epub+zip', buffer: epubFixture(), format: 'epub', phrase: 'Fixture EPUB phrase' },
    { filename: 'sample.pptx', contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: pptxFixture(), format: 'pptx', phrase: 'Fixture PPTX phrase' },
    { filename: 'sample.pdf', contentType: 'application/pdf', buffer: pdfFixture(), format: 'pdf', phrase: 'Fixture PDF phrase' }
  ])('extracts anonymized $format fixtures', async ({ filename, contentType, buffer, format, phrase }) => {
    const result = await extractFileContent(
      Buffer.from(buffer),
      filename,
      contentType,
      'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/sample',
      { pageSize: 20000 }
    );

    expect(result.extractedFormat).toBe(format);
    expect(result.content).toContain(phrase);
  }, 15000);

  it('uses plain text output when requested for office tables', async () => {
    const args = [
      Buffer.from(xlsxFixture()),
      'sample.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'https://campusvirtual.frm.utn.edu.ar/pluginfile.php/1/sample'
    ] as const;
    const markdown = await extractFileContent(...args);
    const plain = await extractFileContent(...args, { format: 'text' });

    expect(markdown.content).toContain('| Column | Value |');
    expect(plain.content).toContain('Fixture row');
    expect(plain.content).not.toContain('| Column | Value |');
  });
});
