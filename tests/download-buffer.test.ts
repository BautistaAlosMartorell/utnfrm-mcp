import { describe, expect, it, vi } from 'vitest';
import { CampusClient } from '../src/client/campus-client.js';

const ORIGIN = 'https://campusvirtual.frm.utn.edu.ar';

function fakeResponse(options: { url: string; headers: Record<string, string>; body?: Buffer; text?: string; status?: number }) {
  return {
    status: () => options.status ?? 200,
    url: () => options.url,
    headers: () => options.headers,
    body: async () => options.body ?? Buffer.alloc(0),
    text: async () => options.text ?? ''
  };
}

function clientWith(responses: ReturnType<typeof fakeResponse>[]) {
  const client = new CampusClient();
  const requestCampus = vi.fn(async () => {
    const response = responses.shift();
    if (!response) throw new Error('unexpected request');
    return { response, inspectedText: response.headers()['content-type']?.includes('text/html') ? await response.text() : undefined };
  });
  (client as unknown as { requestCampus: typeof requestCampus }).requestCampus = requestCampus;
  return { client, requestCampus };
}

const viewPage = (extra = '') => `<html><body><img src="${ORIGIN}/pluginfile.php/490/user/icon/boost/f1">
  <a href="${ORIGIN}/pluginfile.php/55/mod_resource/content/2/Apunte.pdf?forcedownload=1">Apunte</a>${extra}</body></html>`;

describe('downloadBuffer', () => {
  it('follows a resource view page that has no Content-Length (chunked HTML)', async () => {
    const pdf = Buffer.from('%PDF-1.7 contenido');
    const { client, requestCampus } = clientWith([
      fakeResponse({ url: `${ORIGIN}/mod/resource/view.php?id=1`, headers: { 'content-type': 'text/html; charset=utf-8' }, text: viewPage() }),
      fakeResponse({
        url: `${ORIGIN}/pluginfile.php/55/mod_resource/content/2/Apunte.pdf`,
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(pdf.length),
          'content-disposition': 'inline; filename="RegresiÃ³n lÃ³gica.pdf"'
        },
        body: pdf
      })
    ]);
    const result = await client.downloadBuffer('/mod/resource/view.php?id=1');
    expect(result.buffer.equals(pdf)).toBe(true);
    expect(result.filename).toBe('Regresión lógica.pdf');
    expect(requestCampus).toHaveBeenCalledTimes(2);
    expect(String(requestCampus.mock.calls[1][1])).toContain('/mod_resource/content/2/');
  });

  it('still refuses a binary download that does not declare its size', async () => {
    const { client } = clientWith([
      fakeResponse({ url: `${ORIGIN}/pluginfile.php/55/mod_resource/content/2/Apunte.pdf`, headers: { 'content-type': 'application/pdf' }, body: Buffer.from('x') })
    ]);
    await expect(client.downloadBuffer('/pluginfile.php/55/mod_resource/content/2/Apunte.pdf')).rejects.toThrow(/tamaño de descarga/);
  });

  it('explains folders with several files instead of picking one', async () => {
    const html = `<a href="${ORIGIN}/pluginfile.php/8/mod_folder/content/0/uno.pdf">uno</a><a href="${ORIGIN}/pluginfile.php/8/mod_folder/content/0/dos.pdf">dos</a>`;
    const { client, requestCampus } = clientWith([
      fakeResponse({ url: `${ORIGIN}/mod/folder/view.php?id=2`, headers: { 'content-type': 'text/html' }, text: html })
    ]);
    await expect(client.downloadBuffer('/mod/folder/view.php?id=2')).rejects.toThrow(/carpeta con 2 archivos.*uno\.pdf.*dos\.pdf.*open/s);
    expect(requestCampus).toHaveBeenCalledTimes(1);
  });

  it('returns the page itself when a view has no file', async () => {
    const { client } = clientWith([
      fakeResponse({ url: `${ORIGIN}/mod/page/view.php?id=3`, headers: { 'content-type': 'text/html' }, text: '<html><body>solo texto</body></html>' })
    ]);
    const result = await client.downloadBuffer('/mod/page/view.php?id=3');
    expect(result.filename).toBe('document.html');
  });

  it('rejects non-campus hosts before any request', async () => {
    const { client, requestCampus } = clientWith([]);
    await expect(client.downloadBuffer('https://evil.example/pluginfile.php/1/mod_resource/content/1/x.pdf')).rejects.toThrow(/Acceso denegado/);
    expect(requestCampus).not.toHaveBeenCalled();
  });
});
