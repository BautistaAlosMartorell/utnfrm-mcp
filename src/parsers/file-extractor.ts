import * as officeParser from 'officeparser';
import { ExtractedFileContent } from '../types/index.js';
import { resolveLocalOcrConfig } from './local-ocr-config.js';

export interface FileExtractionOptions {
  page?: number;
  pageSize?: number;
  offset?: number;
  ocr?: boolean;
  format?: 'markdown' | 'text' | 'raw';
}

type PdfPage = { text?: string; metadata?: { pageNumber?: number } };

/** Select extracted text by original PDF page number, including OCR-only content. */
export function selectPdfPageText(
  pages: PdfPage[],
  requestedPage: number,
  ocrPageTexts?: string[]
): string | undefined {
  const pageIndex = pages.findIndex(page => page.metadata?.pageNumber === requestedPage);
  const selectedIndex = pageIndex >= 0 ? pageIndex : requestedPage - 1;
  const page = pages[selectedIndex];
  if (!page || (page.metadata?.pageNumber && page.metadata.pageNumber !== requestedPage)) return undefined;
  return ocrPageTexts?.[selectedIndex] ?? page.text ?? '';
}

const OFFICE_DECOMPRESSION_LIMITS = {
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxZipEntries: 2000,
  maxTableCells: 200000,
  maxXmlElements: 500000,
  maxRawContentLength: 20 * 1024 * 1024,
  maxRepeatedContent: 8 * 1024 * 1024
};

const MAX_PDF_OUTPUT_CHARACTERS = 5_000_000;
const MAX_OCR_PAGES_PER_REQUEST = 10;

function safeOfficeIssueWarning(issue: { code?: string; type?: string }): string | undefined {
  switch (issue.code) {
    case 'PDF_NO_TEXT_EXTRACTED': return 'Una o mÃ¡s pÃ¡ginas no contienen texto digital extraÃ­ble; pueden ser escaneos o imÃ¡genes.';
    case 'PDF_CONTENT_LIMIT_EXCEEDED': return 'La lectura del PDF alcanzÃ³ un lÃ­mite de seguridad; el resultado puede estar incompleto.';
    case 'PDF_TEXT_ENCODING_SUSPECT': return 'El PDF contiene caracteres que no pudieron decodificarse con fiabilidad.';
    case 'PAGE_LOAD_FAILED': return 'No se pudo leer una o mÃ¡s pÃ¡ginas del documento.';
    case 'ANNOTATION_EXTRACTION_FAILED': return 'No se pudieron leer todos los enlaces o anotaciones del PDF.';
    case 'OCR_FAILED': return 'FallÃ³ el OCR local de una o mÃ¡s imÃ¡genes; el texto reconocido puede estar incompleto.';
    case 'OCR_REQUIRES_ATTACHMENTS': return 'El procesador no pudo adjuntar las imÃ¡genes necesarias para OCR.';
    case 'IMAGE_EXTRACTION_FAILED':
    case 'IMAGE_PROCESSING_FAILED': return 'No se pudieron procesar todas las imÃ¡genes del PDF.';
    case 'PDF_SEPARATE_PROCESS_UNAVAILABLE': return 'El procesador aislado de PDF no estuvo disponible; se usÃ³ el proceso principal.';
    default: return issue.type === 'error' || issue.code
      ? 'El procesador detect\u00f3 una limitaci\u00f3n durante la extracci\u00f3n; el resultado puede estar incompleto.'
      : undefined;
  }
}

/**
 * Extrae texto estructurado y paginado a partir de un buffer binario de Moodle (PDF, DOCX, PPTX, XLSX, TXT)
 */
export async function extractFileContent(
  buffer: Buffer,
  filename: string,
  contentType: string,
  downloadUrl: string,
  options: FileExtractionOptions = {}
): Promise<ExtractedFileContent> {
  const requestedPageSize = Number.isFinite(options.pageSize) ? options.pageSize! : 8000;
  const pageSize = Math.max(256, Math.min(Math.trunc(requestedPageSize), 20000));
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const officeOutputFormat = options.format === 'text' || options.format === 'raw' ? 'text' : 'md';
  const fileSizeBytes = buffer.length;

  let extractedFormat: ExtractedFileContent['extractedFormat'] = 'unsupported';
  let totalPages: number | undefined = undefined;
  let currentPage: number | undefined = options.page;
  let content = '';
  let truncated = false;
  let extractionError = false;
  let missingPdfTextPages = false;
  let ocrPageLimitReached = false;
  let ocrPerformed = false;
  let parsedPdfText = '';
  let nextOffset: number | undefined;
  let contentLength: number | undefined;
  let currentOffset: number | undefined;
  const extractionWarnings: string[] = [];
  const officeIssues: { code?: string; type?: string }[] = [];

  try {
    // 1. PDF
    if (ext === 'pdf' || contentType.includes('application/pdf')) {
      extractedFormat = 'pdf';
      try {
        const ocrConfig = resolveLocalOcrConfig(options.ocr === true);
        if (options.ocr && !ocrConfig.available) extractionWarnings.push(ocrConfig.warning);
        const abortController = new AbortController();
        const timeout = setTimeout(() => abortController.abort(), options.ocr && ocrConfig.available ? 120_000 : 60_000);
        let res: any;
        try {
          res = await officeParser.parseOffice(buffer, {
          fileType: 'pdf',
          decompressionLimits: OFFICE_DECOMPRESSION_LIMITS,
          allowRemoteAssets: false,
          abortSignal: abortController.signal,
          onWarning: issue => officeIssues.push(issue),
          extractAttachments: options.ocr && ocrConfig.available,
          ...(options.page
            ? { pdfParserConfig: { pageRange: String(options.page) } }
            : options.ocr && ocrConfig.available
              ? { pdfParserConfig: { pageRange: `1-${MAX_OCR_PAGES_PER_REQUEST}` } }
              : {}),
          ...(options.ocr && ocrConfig.available ? {
            ocr: true,
            ocrConfig: {
              language: ocrConfig.language,
              langPath: ocrConfig.langPath,
              cacheMethod: 'none' as const,
              timeout: { workerLoad: 30_000, recognition: 30_000, autoTerminate: 1_000 }
            }
          } : {})
          });
        } finally {
          clearTimeout(timeout);
        }
        ocrPerformed = options.ocr === true && ocrConfig.available;
        for (const issue of officeIssues) {
          const warning = safeOfficeIssueWarning(issue);
          if (warning && !extractionWarnings.includes(warning)) extractionWarnings.push(warning);
        }
        const pages: PdfPage[] = Array.isArray(res?.content) ? res.content : [];
        let ocrPageTexts: string[] | undefined;
        totalPages = res?.metadata?.pages || (pages.length > 0 ? pages.length : 1);
        ocrPageLimitReached = ocrPerformed && !options.page && typeof totalPages === 'number' && totalPages > MAX_OCR_PAGES_PER_REQUEST;
        if (ocrPageLimitReached) extractionWarnings.push(`El OCR se limitó a las primeras ${MAX_OCR_PAGES_PER_REQUEST} páginas por solicitud; usa page para continuar con páginas posteriores.`);
        missingPdfTextPages = pages.some(page => !page.text?.trim());
        if (ocrPerformed) {
          const generated = await res.to('text', { includeImages: 'ocr-text-only', textConfig: { pageSeparator: '\f' } });
          ocrPageTexts = String(generated.value || '').split('\f');
          parsedPdfText = ocrPageTexts.map((text: string, idx: number) => `### Página ${pages[idx]?.metadata?.pageNumber || idx + 1} / ${totalPages}\n${text.trim()}`.trim()).join('\n\n---\n\n');
          missingPdfTextPages = ocrPageTexts.some((text: string) => !text.trim());
        } else {
          parsedPdfText = pages.map((p, idx) => `### Página ${p.metadata?.pageNumber || idx + 1} / ${totalPages}\n${p.text || ''}`.trim()).join('\n\n---\n\n');
        }
        if (!pages.length) parsedPdfText = typeof res === 'string' ? res : (res?.text || '');
        if (options.page && options.page > 0) {
          const pageText = selectPdfPageText(pages, options.page, ocrPageTexts);
          if (pageText !== undefined) {
            content = `## Página ${options.page} de ${totalPages}\n\n${pageText}`.trim();
          } else {
            content = `La página ${options.page} excede el total de páginas (${totalPages}).`;
          }
        } else {
          content = parsedPdfText;
        }
      } catch {
        extractionError = true;
        extractionWarnings.push('No se pudo extraer texto del PDF. Puede estar escaneado, protegido, dañado o la lectura superó el tiempo permitido.');
        content = 'No se pudo extraer el contenido del PDF.';
      }
    }
    // 2. Word (.docx)
    else if (ext === 'docx' || contentType.includes('wordprocessingml.document')) {
      extractedFormat = 'docx';
      try {
        const ast = await officeParser.parseOffice(buffer, {
          fileType: 'docx',
          decompressionLimits: OFFICE_DECOMPRESSION_LIMITS,
          allowRemoteAssets: false,
          onWarning: issue => officeIssues.push(issue)
        });
        const output = await officeParser.OfficeGenerator.generate(ast, officeOutputFormat);
        content = output.value.trim();
      } catch {
        extractionError = true;
        extractionWarnings.push('No se pudo extraer el contenido DOCX completo.');
        content = 'No se pudo extraer el contenido del documento DOCX.';
      }
    }
    // 3. Excel (.xlsx)
    else if (ext === 'xlsx' || contentType.includes('spreadsheetml')) {
      extractedFormat = 'xlsx';
      try {
        const ast = await officeParser.parseOffice(buffer, {
          fileType: 'xlsx',
          decompressionLimits: OFFICE_DECOMPRESSION_LIMITS,
          allowRemoteAssets: false,
          onWarning: issue => officeIssues.push(issue)
        });
        const output = await officeParser.OfficeGenerator.generate(ast, officeOutputFormat);
        content = output.value.trim() || 'El archivo de Excel está vacío.';
      } catch {
        extractionError = true;
        extractionWarnings.push('No se pudo extraer el contenido XLSX completo.');
        content = 'No se pudo extraer el contenido de la planilla XLSX.';
      }
    }
    // 4. PowerPoint (.pptx)
    else if (ext === 'pptx' || contentType.includes('presentationml')) {
      extractedFormat = 'pptx';
      try {
        const res: any = await officeParser.parseOffice(buffer, {
          fileType: 'pptx',
          decompressionLimits: OFFICE_DECOMPRESSION_LIMITS,
          allowRemoteAssets: false,
          onWarning: issue => officeIssues.push(issue)
        });
        totalPages = Array.isArray(res?.content) ? res.content.length : undefined;
        const output = await officeParser.OfficeGenerator.generate(res, officeOutputFormat);
        content = output.value.trim();
      } catch {
        extractionError = true;
        extractionWarnings.push('No se pudo extraer el contenido PPTX completo.');
        content = 'No se pudo extraer el contenido de la presentación PPTX.';
      }
    }
    // 5. Archivos de Texto / Código / CSV / Markdown
    else if (
      ['odt', 'ods', 'rtf', 'epub'].includes(ext) ||
      contentType.includes('opendocument.text') ||
      contentType.includes('opendocument.spreadsheet') ||
      contentType.includes('application/rtf') ||
      contentType.includes('application/epub+zip')
    ) {
      const fileType: 'odt' | 'ods' | 'rtf' | 'epub' =
        ext === 'odt' || contentType.includes('opendocument.text') ? 'odt' :
        ext === 'ods' || contentType.includes('opendocument.spreadsheet') ? 'ods' :
        ext === 'rtf' || contentType.includes('application/rtf') ? 'rtf' : 'epub';
      extractedFormat = fileType;
      try {
        const ast = await officeParser.parseOffice(buffer, {
          fileType,
          decompressionLimits: OFFICE_DECOMPRESSION_LIMITS,
          allowRemoteAssets: false,
          onWarning: issue => officeIssues.push(issue)
        });
        const output = await officeParser.OfficeGenerator.generate(ast, officeOutputFormat);
        content = output.value.trim();
      } catch {
        extractionError = true;
        extractionWarnings.push(`No se pudo extraer el contenido ${fileType.toUpperCase()} completo.`);
        content = `No se pudo extraer el contenido ${fileType.toUpperCase()}.`;
      }
    }
    else if (
      ext === 'txt' || ext === 'csv' || ext === 'md' || ext === 'py' || ext === 'c' ||
      ext === 'cpp' || ext === 'h' || ext === 'java' || ext === 'json' || ext === 'html' ||
      contentType.startsWith('text/')
    ) {
      extractedFormat = 'text';
      content = buffer.toString('utf8');
    }
    // 6. Formatos no soportados (imágenes binarias pesadas, zip, rar, binarios)
    else {
      extractedFormat = 'unsupported';
      content = `El formato del archivo (${ext || contentType}) no permite extracción directa de texto. Podés descargarlo directamente usando el enlace proporcionado.`;
      extractionWarnings.push('El formato no se puede extraer a texto con los procesadores incluidos.');
    }
  } catch {
    extractionError = true;
    extractionWarnings.push('Falló la extracción general del archivo.');
    content = 'No se pudo extraer el contenido del archivo.';
  }

  if (extractedFormat === 'pdf' && !content.trim()) {
    extractionWarnings.push('El PDF no contiene texto extraíble. Puede ser un documento escaneado o contener imágenes sin texto reconocible.');
  } else if (extractedFormat === 'pdf' && missingPdfTextPages) {
    extractionWarnings.push('Algunas páginas del PDF no devolvieron texto. El resultado puede estar incompleto.');
  }
  if (ocrPageLimitReached) truncated = true;

  // Los PDF usan su paginación nativa; el resto de formatos se pagina por fragmentos de texto.
  if (extractedFormat === 'pdf' && options.page && !extractionError) {
    contentLength = content.length;
    currentOffset = Math.min(options.offset || 0, content.length);
    const end = Math.min(currentOffset + pageSize, content.length);
    content = content.slice(currentOffset, end);
    truncated = end < contentLength;
    if (truncated) nextOffset = end;
    if (truncated) content += `\n\n... [Contenido parcial. Continuar con offset=${end} y la misma pagina].`;
    if (options.offset && options.offset >= contentLength) content = 'El desplazamiento solicitado excede el contenido de la pagina.';
  } else if (extractedFormat !== 'pdf') {
    totalPages = Math.max(1, Math.ceil(content.length / pageSize));
    currentPage = options.page || 1;
    const start = (currentPage - 1) * pageSize;
    if (start >= content.length && content.length > 0) {
      content = `El fragmento ${currentPage} excede el total disponible (${totalPages}).`;
    } else {
      const chunk = content.slice(start, start + pageSize);
      truncated = start + pageSize < content.length;
      content = truncated
        ? chunk + `\n\n... [Fragmento ${currentPage} de ${totalPages}.]`
        : chunk;
    }
  } else if (!options.page) {
    const boundedLength = Math.min(parsedPdfText.length, MAX_PDF_OUTPUT_CHARACTERS);
    const source = parsedPdfText.slice(0, boundedLength);
    contentLength = parsedPdfText.length;
    currentOffset = Math.min(options.offset || 0, boundedLength);
    const end = Math.min(currentOffset + pageSize, boundedLength);
    content = source.slice(currentOffset, end);
    truncated = end < parsedPdfText.length;
    if (parsedPdfText.length > MAX_PDF_OUTPUT_CHARACTERS) extractionWarnings.push('El PDF excedió el límite total de extracción; solo se procesaron los primeros 5 MB de texto.');
    if (truncated) nextOffset = end;
    if (truncated) content += `\n\n... [Contenido parcial. Continuar con offset=${end}].`;
    if (options.offset && options.offset >= boundedLength) content = 'El desplazamiento solicitado excede el contenido extraído.';
  }

  for (const issue of officeIssues) {
    const warning = safeOfficeIssueWarning(issue);
    if (warning && !extractionWarnings.includes(warning)) extractionWarnings.push(warning);
  }

  const extractionStatus: ExtractedFileContent['extractionStatus'] = extractedFormat === 'unsupported'
    ? 'unsupported'
    : extractionError
      ? 'error'
      : !content.trim()
        ? 'empty'
        : truncated || missingPdfTextPages || officeIssues.length > 0
          ? 'partial'
          : 'complete';
  if (truncated) extractionWarnings.push('La respuesta se truncó por el límite de fragmento; solicitar otra página o fragmento para continuar.');

  return {
    filename,
    contentType,
    fileSize: fileSizeBytes,
    fileSizeBytes,
    downloadUrl,
    extractedFormat,
    totalPages,
    currentPage,
    pageSize,
    content: content.trim(),
    truncated,
    extractionStatus,
    extractionWarnings,
    currentOffset,
    nextOffset,
    contentLength,
    ocrPerformed
  };
}
