import { describe, expect, it } from 'vitest';
import { assertDownloadContentLength, MAX_FILE_BYTES } from '../src/client/download-policy.js';

describe('download size policy', () => {
  it('accepts a valid declared size up to the 50 MiB boundary', () => {
    expect(assertDownloadContentLength('0')).toBe(0);
    expect(assertDownloadContentLength(String(MAX_FILE_BYTES))).toBe(MAX_FILE_BYTES);
  });

  it('rejects missing or malformed lengths before reading the response body', () => {
    for (const value of [undefined, '', 'unknown', '-1', '5,000']) {
      expect(() => assertDownloadContentLength(value)).toThrow(/no se pudo verificar/i);
    }
    expect(() => assertDownloadContentLength('9007199254740992')).toThrow(/tamaño de descarga no válido/i);
  });

  it('rejects downloads above the local limit from the declared size', () => {
    expect(() => assertDownloadContentLength(String(MAX_FILE_BYTES + 1))).toThrow(/50 MiB/i);
  });
});
