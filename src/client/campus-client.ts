import * as cheerio from 'cheerio';
import { request, APIRequestContext, APIResponse, chromium, Browser, BrowserContext } from 'playwright';
import { CAMPUS_ORIGIN, DEFAULT_TIMEOUT_MS, PATHS } from '../config.js';
import { SessionStore } from '../session/session-store.js';
import { isCampusLoginUrl, resolveCampusUrl } from './campus-url.js';
import { sanitizeCampusErrorMessage } from './error-sanitizer.js';
import { campusRequestPolicy, isReadOnlyCampusPost } from './campus-request-policy.js';
import { assertCampusWritesEnabled } from './write-policy.js';
import { getCampusOperationSignal } from './campus-operation-context.js';
import { assertDownloadContentLength, MAX_FILE_BYTES } from './download-policy.js';
import { filenameFromContentDisposition, pickResourceFile } from './campus-links.js';
import { readCachedDownload, writeCachedDownload } from './file-cache.js';

const MAX_REDIRECTS = 5;

/** Enlace externo (fuera del Campus) de una página de módulo URL: el cuerpo de la actividad o su iframe. */
export function extractExternalLink(html: string): string | undefined {
  const $ = cheerio.load(html);
  const candidates = [
    $('.urlworkaround a').first().attr('href'),
    $('[role="main"] iframe[src^="http"]').first().attr('src'),
    $('meta[http-equiv="refresh"]').first().attr('content')?.match(/url=(.+)$/i)?.[1],
    $('[role="main"] a[href^="http"]').filter((_, el) => {
      try { return new URL($(el).attr('href') || '').origin !== CAMPUS_ORIGIN; } catch { return false; }
    }).first().attr('href')
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const url = new URL(candidate.trim());
      if ((url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== CAMPUS_ORIGIN) return url.href;
    } catch {
      // siguiente candidato
    }
  }
  return undefined;
}

type CampusResponse = { response: APIResponse; inspectedText?: string };

export type RenderedPageDiagnostics = {
  readOnlyAjaxMethods: string[];
  blockedPostMethodNames: string[];
  unrecognizedPostCount: number;
  responseStatusCounts: Record<string, number>;
  finalPath?: string;
};

export class CampusClient {
  private apiContext: APIRequestContext | null = null;
  private browser: Browser | null = null;
  private browserContext: BrowserContext | null = null;
  /** Marca de la sesión con la que se crearon los contextos abiertos; si cambia, se descartan. */
  private contextSessionMs: number | undefined;

  /** Si la persona volvió a iniciar sesión con el MCP andando, descarta las cookies viejas y levanta el bloqueo por sesión vencida. */
  private async adoptRenewedSession(): Promise<void> {
    const savedMs = SessionStore.savedAt()?.getTime();
    if (savedMs === undefined) return;
    const renewed = campusRequestPolicy.clearAuthenticationBlockIfRenewed(savedMs);
    if (renewed || (this.contextSessionMs !== undefined && savedMs > this.contextSessionMs)) await this.close();
  }

  private async requestCampus(
    method: 'GET' | 'POST',
    pathOrUrl: string,
    form?: Record<string, string>
  ): Promise<CampusResponse> {
    await this.adoptRenewedSession();
    campusRequestPolicy.assertAvailable();
    let target = resolveCampusUrl(pathOrUrl);
    let currentMethod = method;
    let currentForm = form;

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      if (isCampusLoginUrl(target)) {
        campusRequestPolicy.block('authentication');
        throw new Error('La sesión del Campus Virtual expiró. Volvé a iniciar sesión con utn-mcp-mendoza login.');
      }
      let result: CampusResponse;
      const signal = getCampusOperationSignal();
      try {
        result = await campusRequestPolicy.run(async () => {
          // Initialize after leaving the queue so a prior cancellation cannot leave a stale context here.
          const ctx = await this.getRequestContext();
          const abortRequestContext = () => {
            if (this.apiContext === ctx) this.apiContext = null;
            void ctx.dispose().catch(() => null);
          };
          if (signal?.aborted) {
            abortRequestContext();
            throw new Error('La solicitud al Campus fue cancelada por el cliente MCP.');
          }
          signal?.addEventListener('abort', abortRequestContext, { once: true });
          try {
            if (signal?.aborted) {
              abortRequestContext();
              throw new Error('La solicitud al Campus fue cancelada por el cliente MCP.');
            }
            const response = await (currentMethod === 'GET'
              ? ctx.get(target, { maxRedirects: 0 })
              : ctx.post(target, { form: currentForm, maxRedirects: 0 }));
            const finalUrl = resolveCampusUrl(response.url());
            if (isCampusLoginUrl(finalUrl)) {
              campusRequestPolicy.block('authentication');
              throw new Error('La sesión del Campus Virtual expiró. Volvé a iniciar sesión con utn-mcp-mendoza login.');
            }
            let inspectedText: string | undefined;
            if ((response.headers()['content-type'] || '').includes('text/html')) {
              inspectedText = await response.text();
              this.throwIfSessionExpired(finalUrl, inspectedText);
            }
            const status = response.status();
            if (status === 401) {
              campusRequestPolicy.block('authentication');
              throw new Error('El Campus devolvió 401. Las solicitudes se detuvieron; revisá la sesión y reiniciá el MCP tras volver a iniciar sesión.');
            }
            if (status === 403) {
              campusRequestPolicy.block('authorization');
              throw new Error('El Campus devolvió 403. Las solicitudes se detuvieron por seguridad/permisos.');
            }
            if (status === 429) {
              campusRequestPolicy.block('rate-limit');
              throw new Error('El Campus devolvió 429. Las solicitudes se detuvieron; no se reintentará automáticamente.');
            }
            return { response, inspectedText };
          } finally {
            signal?.removeEventListener('abort', abortRequestContext);
          }
        }, signal);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Error de red';
        if (signal?.aborted) throw new Error('La solicitud al Campus fue cancelada por el cliente MCP.');
        throw new Error(sanitizeCampusErrorMessage(message) || 'No se pudo completar la solicitud al Campus.');
      }
      const { response } = result;
      const status = response.status();
      if (![301, 302, 303, 307, 308].includes(status)) {
        resolveCampusUrl(response.url());
        return result;
      }

      const location = response.headers().location;
      if (!location) return result;
      if (redirects === MAX_REDIRECTS) {
        throw new Error('El Campus superó el máximo de redirecciones permitidas.');
      }

      target = resolveCampusUrl(location, target);
      if (status === 303 || ((status === 301 || status === 302) && currentMethod === 'POST')) {
        currentMethod = 'GET';
        currentForm = undefined;
      }
    }

    throw new Error('No se pudo completar la navegación segura al Campus.');
  }

  private throwIfSessionExpired(finalUrl: string, responseText?: string): void {
    if (isCampusLoginUrl(finalUrl) || (responseText?.includes('id="login"') &&
      responseText.includes('name="password"') && !responseText.includes('class="userbutton"'))) {
      campusRequestPolicy.block('authentication');
      throw new Error('La sesión del Campus Virtual expiró. Volvé a iniciar sesión con utn-mcp-mendoza login.');
    }
    if (responseText && /cf-chl-|captcha-container|g-recaptcha|security challenge|temporarily blocked|unusual traffic/i.test(responseText.slice(0, 12000))) {
      campusRequestPolicy.block('security-challenge');
      throw new Error('El Campus presentó un desafío de seguridad. Se detuvieron las solicitudes y no se intentará evadirlo.');
    }
  }

  /**
   * Obtiene o inicializa el contexto de peticiones autenticado.
   */
  private async getRequestContext(): Promise<APIRequestContext> {
    if (!SessionStore.exists()) {
      throw new Error(
        'No se encontró una sesión activa para el Campus Virtual UTN Mendoza.\n' +
        'Ejecutá `utn-mcp-mendoza login` en la terminal para iniciar sesión de forma segura (o `utn-mcp-mendoza setup-wizard` para que te guíe paso a paso).'
      );
    }

    if (!this.apiContext) {
      SessionStore.protectExistingSession();
      this.contextSessionMs = SessionStore.savedAt()?.getTime();
      this.apiContext = await request.newContext({
        baseURL: CAMPUS_ORIGIN,
        storageState: await SessionStore.getPlaywrightStorageState(),
        timeout: DEFAULT_TIMEOUT_MS,
        extraHTTPHeaders: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8'
        }
      });
    }

    return this.apiContext;
  }

  /**
   * Obtiene el HTML de una ruta relativa o URL completa mediante petición HTTP directa.
   */
  async getHtml(pathOrUrl: string): Promise<string> {
    resolveCampusUrl(pathOrUrl);
    const result = await this.requestCampus('GET', pathOrUrl);
    const response = result.response;

    if (response.status() === 401 || response.status() === 403) {
      throw new Error('Sesión expirada o permisos insuficientes. Ejecutá `utn-mcp-mendoza login`.');
    }

    const finalUrl = resolveCampusUrl(response.url());
    if (response.status() < 200 || response.status() >= 300) {
      throw new Error(`El Campus respondió con HTTP ${response.status()} al consultar la página.`);
    }

    const text = result.inspectedText ?? await response.text();
    this.throwIfSessionExpired(finalUrl, text);

    return text;
  }

  /**
   * Extrae el sesskey de Moodle necesario para operaciones de escritura autenticadas.
   */
  async getSesskey(): Promise<string> {
    const html = await this.getHtml(PATHS.dashboard);
    const match1 = html.match(/"sesskey":"([a-zA-Z0-9]+)"/);
    if (match1) return match1[1];
    const match2 = html.match(/sesskey=([a-zA-Z0-9]+)/);
    if (match2) return match2[1];
    const match3 = html.match(/name="sesskey"\s+value="([a-zA-Z0-9]+)"/);
    if (match3) return match3[1];
    throw new Error('No se pudo determinar el sesskey de Moodle. Verificá tu sesión con `utn-mcp-mendoza login`.');
  }

  /**
   * Descarga un archivo o recurso binario (PDF, DOCX, etc.) mediante petición autenticada.
   * Si la URL apunta a una vista de recurso HTML de Moodle (/mod/resource/view.php),
   * resuelve automáticamente el enlace subyacente de /pluginfile.php/...
   */
  async downloadBuffer(pathOrUrl: string): Promise<{
    buffer: Buffer;
    contentType: string;
    filename: string;
    finalUrl: string;
    status: number;
  }> {
    resolveCampusUrl(pathOrUrl);
    const direct = readCachedDownload(resolveCampusUrl(pathOrUrl));
    if (direct) return { ...direct, status: 200 };

    let result = await this.requestCampus('GET', pathOrUrl);
    let response = result.response;

    if (response.status() === 401 || response.status() === 403) {
      throw new Error('Sesión expirada o permisos insuficientes.');
    }

    let finalUrl = resolveCampusUrl(response.url());
    if (response.status() < 200 || response.status() >= 300) {
      throw new Error(`El Campus respondió con HTTP ${response.status()} al descargar el archivo.`);
    }

    let contentType = response.headers()['content-type'] || 'application/octet-stream';

    // Si Moodle devolvió HTML en vez de archivo directo (típico de /mod/resource/view.php?id=...).
    // El HTML ya se leyó completo (inspectedText), así que su tamaño no hay que verificarlo: Moodle suele
    // enviarlo sin Content-Length (chunked). La exigencia de tamaño declarado aplica solo al binario.
    if (contentType.includes('text/html')) {
      const html = result.inspectedText ?? await response.text();
      this.throwIfSessionExpired(finalUrl, html);
      const picked = pickResourceFile(html, finalUrl);

      if (picked.ambiguous.length > 0) {
        const names = picked.ambiguous.map(candidate => candidate.name).filter(Boolean).slice(0, 20).join(', ');
        throw new Error(
          `La página es una carpeta con ${picked.ambiguous.length} archivos (${names}). ` +
          'Usá `open` sobre la carpeta para obtener la URL de cada archivo y leelos de a uno.'
        );
      }

      if (picked.url) {
        const cached = readCachedDownload(picked.url);
        if (cached) return { ...cached, status: 200 };
        result = await this.requestCampus('GET', picked.url);
        response = result.response;
        if (response.status() < 200 || response.status() >= 300) {
          throw new Error(`El Campus respondió con HTTP ${response.status()} al descargar el archivo.`);
        }
        finalUrl = resolveCampusUrl(response.url());
        contentType = response.headers()['content-type'] || 'application/octet-stream';
        if (!contentType.includes('text/html')) assertDownloadContentLength(response.headers()['content-length']);
      } else {
        // Devolver el buffer HTML si no había pluginfile
        const bodyBuf = Buffer.from(html, 'utf8');
        return {
          buffer: bodyBuf,
          contentType,
          filename: 'document.html',
          finalUrl,
          status: response.status()
        };
      }
    } else {
      assertDownloadContentLength(response.headers()['content-length']);
    }

    const buffer = await response.body();
    if (buffer.byteLength > MAX_FILE_BYTES) {
      throw new Error('El archivo supera el límite local de 50 MiB para extracción.');
    }

    let filename = filenameFromContentDisposition(response.headers()['content-disposition'] || '') || 'archivo';
    if (filename === 'archivo') {
      try {
        const parsedPath = new URL(finalUrl).pathname;
        const lastSegment = parsedPath.split('/').filter(Boolean).pop();
        if (lastSegment && lastSegment.includes('.')) {
          filename = decodeURIComponent(lastSegment);
        }
      } catch {
        // Mantener fallback
      }
    }

    const download = { buffer, contentType, filename, finalUrl };
    writeCachedDownload(finalUrl, download);
    return { ...download, status: response.status() };
  }

  /**
   * Resuelve un módulo "URL" del Campus (/mod/url/view.php) al enlace externo al que apunta, SIN seguirlo:
   * Moodle responde con una redirección o con una página que contiene el enlace.
   */
  async resolveUrlModule(pathOrUrl: string): Promise<string> {
    const target = resolveCampusUrl(pathOrUrl);
    if (new URL(target).pathname !== '/mod/url/view.php') {
      throw new Error('Se esperaba una URL de un módulo enlace del Campus (/mod/url/view.php).');
    }
    campusRequestPolicy.assertAvailable();
    const signal = getCampusOperationSignal();
    return campusRequestPolicy.run(async () => {
      const ctx = await this.getRequestContext();
      const response = await ctx.get(target, { maxRedirects: 0 });
      const status = response.status();
      if (status === 401 || status === 403) throw new Error('Sesión expirada o permisos insuficientes.');
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers().location;
        if (!location) throw new Error('El Campus no informó a dónde apunta el enlace.');
        const resolved = new URL(location, target);
        if (isCampusLoginUrl(resolved.href)) throw new Error('La sesión del Campus Virtual expiró. Volvé a iniciar sesión con utn-mcp-mendoza login.');
        if (resolved.origin !== CAMPUS_ORIGIN) return resolved.href;
      } else if (status < 200 || status >= 300) {
        throw new Error(`El Campus respondió con HTTP ${status} al consultar el enlace.`);
      }
      const html = status >= 200 && status < 300 ? await response.text() : '';
      this.throwIfSessionExpired(resolveCampusUrl(response.url()), html);
      const external = extractExternalLink(html);
      if (!external) throw new Error('No se encontró el enlace externo en la página del Campus.');
      return external;
    }, signal);
  }

  /**
   * Realiza una petición POST autenticada con datos de formulario.
   * Auto-inyecta sesskey si no está presente en formData.
   */
  async postForm(pathOrUrl: string, formData: Record<string, string>): Promise<{
    status: number;
    text: string;
    finalUrl: string;
  }> {
    assertCampusWritesEnabled();
    resolveCampusUrl(pathOrUrl);

    // Inyectar sesskey si no viene
    const payload: Record<string, string> = { ...formData };
    if (!payload.sesskey) {
      payload.sesskey = await this.getSesskey();
    }

    const result = await this.requestCampus('POST', pathOrUrl, payload);
    const response = result.response;

    const status = response.status();
    const finalUrl = resolveCampusUrl(response.url());
    const text = result.inspectedText ?? await response.text();
    this.throwIfSessionExpired(finalUrl, text);

    return {
      status,
      text,
      finalUrl
    };
  }

  /**
   * Valida si la sesión actual sigue activa comprobando /my/.
   */
  async validateSession(): Promise<{ valid: boolean; userName?: string; error?: string }> {
    try {
      const html = await this.getHtml(PATHS.dashboard);
      const match = html.match(/class="usertext[^>]*>([^<]+)<\/span>/i) ||
                    html.match(/class="usertext">([^<]+)<\/span>/i);
      const userName = match ? match[1].trim() : undefined;
      return { valid: true, userName };
    } catch (err: any) {
      return { valid: false, error: err.message || String(err) };
    }
  }

  /**
   * Navega usando Chromium headless en caso de que una página requiera renderizado JS
   * (por ejemplo, el bloque de cursos en /my/ o /my/courses.php si se cargan asincrónicamente).
   */
  async getRenderedHtml(
    pathOrUrl: string,
    waitSelector?: string,
    diagnostics?: RenderedPageDiagnostics
  ): Promise<string> {
    const targetUrl = resolveCampusUrl(pathOrUrl);
    if (!SessionStore.exists()) {
      throw new Error(
        'No se encontró una sesión activa para el Campus Virtual UTN Mendoza.\n' +
        'Ejecutá `utn-mcp-mendoza login` en la terminal para iniciar sesión de forma segura (o `utn-mcp-mendoza setup-wizard` para que te guíe paso a paso).'
      );
    }

    SessionStore.protectExistingSession();

    if (!this.browser) {
      this.browser = await chromium.launch({ headless: true });
    }

    if (!this.browserContext) {
      this.contextSessionMs = SessionStore.savedAt()?.getTime();
      this.browserContext = await this.browser.newContext({
        storageState: await SessionStore.getPlaywrightStorageState()
      });
    }

    const page = await this.browserContext.newPage();
    const signal = getCampusOperationSignal();
    const abortPage = () => { void page.close().catch(() => null); };
    signal?.addEventListener('abort', abortPage, { once: true });
    try {
      if (signal?.aborted) throw new Error('La solicitud al Campus fue cancelada por el cliente MCP.');
      await page.route('**/*', async route => {
        try {
          const url = new URL(resolveCampusUrl(route.request().url()));
          const method = route.request().method().toUpperCase();
          const methodNames = method === 'POST' && url.pathname === '/lib/ajax/service.php'
            ? this.readMoodleAjaxMethodNames(route.request().postData())
            : [];
          for (const methodName of methodNames) {
            if (diagnostics && !diagnostics.readOnlyAjaxMethods.includes(methodName)) diagnostics.readOnlyAjaxMethods.push(methodName);
          }
          if (method !== 'GET' && method !== 'HEAD' &&
              !(method === 'POST' && isReadOnlyCampusPost(url, route.request().postData()))) {
            if (diagnostics) {
              if (method === 'POST' && methodNames.length === 0) diagnostics.unrecognizedPostCount += 1;
              for (const methodName of methodNames) {
                if (!diagnostics.blockedPostMethodNames.includes(methodName)) diagnostics.blockedPostMethodNames.push(methodName);
              }
            }
            await route.abort();
            return;
          }
          await campusRequestPolicy.run(async () => {
            const response = await route.fetch({ maxRedirects: 0, timeout: DEFAULT_TIMEOUT_MS });
            if (diagnostics) {
              const status = String(response.status());
              diagnostics.responseStatusCounts[status] = (diagnostics.responseStatusCounts[status] || 0) + 1;
            }
            if ([401, 403, 429].includes(response.status())) {
              campusRequestPolicy.block(response.status() === 401 ? 'authentication' : response.status() === 403 ? 'authorization' : 'rate-limit');
            }
            await route.fulfill({ response });
          }, signal);
        } catch {
          await route.abort().catch(() => null);
        }
      });
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });

      await page.waitForFunction(() => {
        if (document.readyState !== 'complete') return false;
        const moodle = (window as Window & { M?: { util?: { pending_js?: unknown[] } } }).M;
        return !moodle?.util?.pending_js || moodle.util.pending_js.length === 0;
      }, { timeout: 10000 }).catch(() => null);

      if (waitSelector) {
        await page.waitForSelector(waitSelector, { timeout: 10000 }).catch(() => null);
      } else {
        await page.waitForTimeout(1500);
      }

      const currentUrl = resolveCampusUrl(page.url());
      if (diagnostics) diagnostics.finalPath = new URL(currentUrl).pathname;
      if (isCampusLoginUrl(currentUrl)) {
        throw new Error('La sesión del Campus Virtual ha expirado. Por favor volvé a iniciar sesión con `utn-mcp-mendoza login`.');
      }

      const html = await page.content();
      this.throwIfSessionExpired(currentUrl, html);
      return html;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error de navegador';
      throw new Error(sanitizeCampusErrorMessage(message) || 'No se pudo abrir la página del Campus.');
    } finally {
      signal?.removeEventListener('abort', abortPage);
      await page.close();
    }
  }

  private readMoodleAjaxMethodNames(postData: string | null): string[] {
    try {
      const payload: unknown = JSON.parse(postData || 'null');
      if (!Array.isArray(payload)) return [];
      return [...new Set(payload.flatMap(item => {
        if (typeof item !== 'object' || item === null) return [];
        const methodName = (item as { methodname?: unknown }).methodname;
        return typeof methodName === 'string' && /^[a-z][a-z0-9_]{0,100}$/i.test(methodName) ? [methodName] : [];
      }))];
    } catch {
      return [];
    }
  }

  /**
   * Cierra contextos y navegadores abiertos para liberar memoria.
   */
  async close(): Promise<void> {
    if (this.apiContext) {
      await this.apiContext.dispose().catch(() => null);
      this.apiContext = null;
    }
    if (this.browserContext) {
      await this.browserContext.close().catch(() => null);
      this.browserContext = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => null);
      this.browser = null;
    }
    this.contextSessionMs = undefined;
  }
}

// Instancia singleton para el servidor
export const campusClient = new CampusClient();
