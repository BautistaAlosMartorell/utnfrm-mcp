import { campusClient } from '../client/campus-client.js';
import { extractFileContent } from '../parsers/file-extractor.js';
import { ExtractedFileContent } from '../types/index.js';

export interface ReadFileInput {
  url: string;
  page?: number;
  page_size?: number;
  offset?: number;
  ocr?: boolean;
  format?: 'markdown' | 'text' | 'raw';
  full?: boolean;
}

export async function handleReadFile(input: ReadFileInput): Promise<ExtractedFileContent> {
  const download = await campusClient.downloadBuffer(input.url);

  return extractFileContent(
    download.buffer,
    download.filename,
    download.contentType,
    download.finalUrl,
    {
      page: input.page,
      pageSize: input.page_size,
      offset: input.offset,
      ocr: input.ocr,
      format: input.format,
      full: input.full
    }
  );
}
