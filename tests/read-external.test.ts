import { describe, expect, it, vi } from 'vitest';
import { CampusClient, extractExternalLink } from '../src/client/campus-client.js';
import {
  allowedHosts, handleReadExternal, notebookToMarkdown, toRawUrl, type ExternalDeps
} from '../src/tools/read-external.js';

const notebook = JSON.stringify({
  metadata: { kernelspec: { language: 'python' } },
  cells: [
    { cell_type: 'markdown', source: ['# Intro\n', 'Texto de la clase'] },
    { cell_type: 'code', source: 'print("hola")', outputs: [{ output_type: 'stream', text: ['hola\n'] }, { output_type: 'display_data', data: { 'image/png': 'AAAA' } }] },
    { cell_type: 'code', source: 'x = 1/0', outputs: [{ output_type: 'error', ename: 'ZeroDivisionError', evalue: 'division by zero' }] },
    { cell_type: 'raw', source: 'ignorada' }
  ]
});

function response(body: string, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(body, { status: init.status ?? 200, headers: init.headers });
}

function deps(handler: (url: string) => Response | Promise<Response>, extra: Partial<ExternalDeps> = {}): ExternalDeps & { fetch: ReturnType<typeof vi.fn> } {
  return { fetch: vi.fn(async (url: string) => handler(url)), resolveModule: vi.fn(async () => 'https://github.com/o/r/blob/main/clase.ipynb'), env: {}, ...extra } as never;
}

describe('toRawUrl', () => {
  it('turns view URLs into raw content URLs', () => {
    expect(toRawUrl(new URL('https://github.com/o/r/blob/main/dir/a.py')).href).toBe('https://raw.githubusercontent.com/o/r/main/dir/a.py');
    expect(toRawUrl(new URL('https://github.com/o/r')).href).toBe('https://raw.githubusercontent.com/o/r/HEAD/README.md');
    expect(toRawUrl(new URL('https://gist.github.com/u/abc123')).href).toBe('https://gist.githubusercontent.com/u/abc123/raw');
    expect(toRawUrl(new URL('https://colab.research.google.com/github/o/r/blob/main/n.ipynb')).href).toBe('https://raw.githubusercontent.com/o/r/main/n.ipynb');
  });
  it('explains what cannot be read', () => {
    expect(() => toRawUrl(new URL('https://colab.research.google.com/drive/1AbC'))).toThrow(/Google Drive/);
    expect(() => toRawUrl(new URL('https://github.com/o/r/tree/main/dir'))).toThrow(/blob/);
  });
});

describe('notebookToMarkdown', () => {
  it('keeps text, code and text outputs, and skips images and raw cells', () => {
    const md = notebookToMarkdown(notebook);
    expect(md).toContain('# Intro\nTexto de la clase');
    expect(md).toContain('```python\nprint("hola")\n```');
    expect(md).toContain('_Salida de la celda 2:_\n\n```\nhola\n```');
    expect(md).toContain('ZeroDivisionError: division by zero');
    expect(md).not.toContain('AAAA');
    expect(md).not.toContain('ignorada');
  });
  it('rejects something that is not a notebook', () => {
    expect(() => notebookToMarkdown('no es json')).toThrow();
  });
});

describe('allowed sites', () => {
  it('defaults to GitHub and Colab and accepts only well-formed extra hosts', () => {
    expect(allowedHosts({})).toEqual(expect.arrayContaining(['github.com', 'raw.githubusercontent.com', 'colab.research.google.com']));
    const extended = allowedHosts({ UTN_MCP_EXTERNAL_ALLOW: 'docs.ejemplo.edu.ar, malo host, localhost, https://x.com' });
    expect(extended).toContain('docs.ejemplo.edu.ar');
    expect(extended).not.toContain('localhost');
    expect(extended.some(host => host.includes(' ') || host.includes('/'))).toBe(false);
  });
});

describe('read_external', () => {
  it('reads a GitHub notebook through its raw URL and converts it', async () => {
    const d = deps(() => response(notebook, { headers: { 'content-type': 'text/plain' } }));
    const result = await handleReadExternal({ url: 'https://github.com/o/r/blob/main/clase.ipynb' }, d);
    expect(d.fetch.mock.calls[0][0]).toBe('https://raw.githubusercontent.com/o/r/main/clase.ipynb');
    expect(result).toMatchObject({ kind: 'notebook', host: 'raw.githubusercontent.com', truncated: false });
    expect(result.contentMarkdown).toContain('# Intro');
    expect(d.resolveModule).not.toHaveBeenCalled();
  });

  it('never sends cookies or credentials and does not follow redirects on its own', async () => {
    const d = deps(() => response('# Hola', { headers: { 'content-type': 'text/markdown' } }));
    await handleReadExternal({ url: 'https://raw.githubusercontent.com/o/r/main/README.md' }, d);
    const init = d.fetch.mock.calls[0][1] as { redirect: string; headers: Record<string, string> };
    expect(init.redirect).toBe('manual');
    expect(Object.keys(init.headers).map(name => name.toLowerCase())).not.toContain('cookie');
    expect(Object.keys(init.headers).map(name => name.toLowerCase())).not.toContain('authorization');
  });

  it('resolves a Campus URL module (by id or by link) before reading', async () => {
    const d = deps(() => response(notebook));
    await handleReadExternal({ url: '57681' }, d);
    expect(d.resolveModule).toHaveBeenCalledWith('/mod/url/view.php?id=57681');
    await handleReadExternal({ url: 'https://campusvirtual.frm.utn.edu.ar/mod/url/view.php?id=55918' }, d);
    expect(d.resolveModule).toHaveBeenLastCalledWith('/mod/url/view.php?id=55918');
  });

  it('refuses sites that are not allowed, http, IP literals and credentials', async () => {
    const d = deps(() => response('x'));
    await expect(handleReadExternal({ url: 'https://ejemplo.com/a.py' }, d)).rejects.toThrow(/UTN_MCP_EXTERNAL_ALLOW/);
    await expect(handleReadExternal({ url: 'http://github.com/o/r/blob/main/a.py' }, d)).rejects.toThrow(/https/);
    await expect(handleReadExternal({ url: 'https://127.0.0.1/a.py' }, d)).rejects.toThrow(/https/);
    await expect(handleReadExternal({ url: 'https://user:pass@github.com/o/r/blob/main/a.py' }, d)).rejects.toThrow(/https/);
    expect(d.fetch).not.toHaveBeenCalled();
    const extended = deps(() => response('print(1)', { headers: { 'content-type': 'text/plain' } }), { env: { UTN_MCP_EXTERNAL_ALLOW: 'docs.ejemplo.edu.ar' } });
    await expect(handleReadExternal({ url: 'https://docs.ejemplo.edu.ar/clase.py' }, extended)).resolves.toMatchObject({ kind: 'code' });
  });

  it('blocks a redirect to a site that is not allowed', async () => {
    const d = deps(url => url.startsWith('https://raw.githubusercontent.com')
      ? response('', { status: 302, headers: { location: 'https://evil.example/robo' } })
      : response('secreto'));
    await expect(handleReadExternal({ url: 'https://raw.githubusercontent.com/o/r/main/a.py' }, d)).rejects.toThrow(/evil\.example/);
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows redirects between allowed hosts, but not forever', async () => {
    const ok = deps(url => url.includes('github.com/o/r/blob')
      ? response('', { status: 301, headers: { location: 'https://raw.githubusercontent.com/o/r/main/a.py' } })
      : response('print(1)', { headers: { 'content-type': 'text/plain' } }));
    await expect(handleReadExternal({ url: 'https://raw.githubusercontent.com/o/r/main/viejo.py' }, deps(() => response('', { status: 302, headers: { location: 'https://raw.githubusercontent.com/o/r/main/viejo.py' } })))).rejects.toThrow(/redirigió demasiadas veces/);
    expect(ok).toBeDefined();
  });

  it('enforces the size limit and reports HTTP errors and unsupported types', async () => {
    await expect(handleReadExternal({ url: 'https://raw.githubusercontent.com/o/r/main/a.py' }, deps(() => response('x', { headers: { 'content-length': String(6 * 1024 * 1024) } })))).rejects.toThrow(/5 MiB/);
    await expect(handleReadExternal({ url: 'https://raw.githubusercontent.com/o/r/main/a.py' }, deps(() => response('', { status: 404 })))).rejects.toThrow(/HTTP 404/);
    await expect(handleReadExternal({ url: 'https://raw.githubusercontent.com/o/r/main/a.zip' }, deps(() => response('PK', { headers: { 'content-type': 'application/zip' } })))).rejects.toThrow(/tipo de contenido/);
  });

  it('truncates very long documents and strips markup from HTML pages', async () => {
    const long = await handleReadExternal({ url: 'https://raw.githubusercontent.com/o/r/main/README.md' }, deps(() => response('a'.repeat(200_000), { headers: { 'content-type': 'text/markdown' } })));
    expect(long.truncated).toBe(true);
    expect(long.contentMarkdown.length).toBeLessThan(151_000);
    const html = await handleReadExternal({ url: 'https://gist.github.com/u/abc' }, deps(() => response('<html><nav>menú</nav><main><p>Hola   mundo</p><script>alert(1)</script></main></html>', { headers: { 'content-type': 'text/html' } })));
    expect(html).toMatchObject({ kind: 'html', contentMarkdown: 'Hola mundo' });
  });
});

describe('Campus URL module resolution', () => {
  it('finds the external link in the usual page layouts and ignores Campus links', () => {
    expect(extractExternalLink('<div class="urlworkaround"><a href="https://github.com/o/r/blob/main/n.ipynb">Abrir</a></div>')).toBe('https://github.com/o/r/blob/main/n.ipynb');
    expect(extractExternalLink('<div role="main"><iframe src="https://colab.research.google.com/github/o/r/blob/main/n.ipynb"></iframe></div>')).toContain('colab.research.google.com');
    expect(extractExternalLink('<div role="main"><a href="https://campusvirtual.frm.utn.edu.ar/x">interno</a><a href="https://ejemplo.com/y">externo</a></div>')).toBe('https://ejemplo.com/y');
    expect(extractExternalLink('<html><head><meta http-equiv="refresh" content="0;url=https://ejemplo.com/z"></head></html>')).toBe('https://ejemplo.com/z');
    expect(extractExternalLink('<a href="javascript:alert(1)">x</a>')).toBeUndefined();
  });

  function clientReturning(response: { status: number; location?: string; html?: string; url?: string }) {
    const client = new CampusClient();
    (client as unknown as { getRequestContext: () => Promise<unknown> }).getRequestContext = async () => ({
      get: async () => ({
        status: () => response.status,
        headers: () => (response.location ? { location: response.location } : {}),
        text: async () => response.html ?? '',
        url: () => response.url ?? 'https://campusvirtual.frm.utn.edu.ar/mod/url/view.php?id=1'
      })
    });
    return client;
  }

  it('returns the redirect target without following it', async () => {
    const client = clientReturning({ status: 302, location: 'https://github.com/o/r' });
    await expect(client.resolveUrlModule('/mod/url/view.php?id=1')).resolves.toBe('https://github.com/o/r');
  });

  it('reads the link from the page when there is no redirect, and rejects other pages and expired sessions', async () => {
    const page = clientReturning({ status: 200, html: '<div class="urlworkaround"><a href="https://github.com/o/r">x</a></div>' });
    await expect(page.resolveUrlModule('/mod/url/view.php?id=1')).resolves.toBe('https://github.com/o/r');
    await expect(page.resolveUrlModule('/mod/resource/view.php?id=1')).rejects.toThrow(/módulo enlace/);
    await expect(clientReturning({ status: 302, location: '/login/index.php' }).resolveUrlModule('/mod/url/view.php?id=1')).rejects.toThrow(/expiró/);
    await expect(clientReturning({ status: 403 }).resolveUrlModule('/mod/url/view.php?id=1')).rejects.toThrow(/Sesión expirada/);
    await expect(clientReturning({ status: 200, html: '<p>sin enlace</p>' }).resolveUrlModule('/mod/url/view.php?id=1')).rejects.toThrow(/No se encontró el enlace/);
  });
});
