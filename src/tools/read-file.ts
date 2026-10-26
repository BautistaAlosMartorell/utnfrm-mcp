import * as cheerio from 'cheerio';
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
}

export async function handleReadFile(input: ReadFileInput): Promise<ExtractedFileContent> {
  const download = await campusClient.downloadBuffer(input.url);

  let buffer = download.buffer;
  if (download.contentType.includes('text/html')) {
    const main = cheerio.load(buffer.toString('utf8'))('[role="main"]').html();
    if (main) buffer = Buffer.from(`<div>${main}</div>`, 'utf8');
  }

  return extractFileContent(
    buffer,
    download.filename,
    download.contentType,
    download.finalUrl,
    {
      page: input.page,
      pageSize: input.page_size,
      offset: input.offset,
      ocr: input.ocr,
      format: input.format
    }
  );
}
