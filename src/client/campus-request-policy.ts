export interface CampusRequestPolicyOptions {
  maxConcurrent: number;
  minIntervalMs: number;
  maxQueued: number;
}

type Waiter = {
  resolve: (release: () => void) => void;
  reject: (error: Error) => void;
  signal?: AbortSignal;
  onAbort?: () => void;
};

function configuredInteger(value: string | undefined, fallback: number, name: string, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function releaseOnce(release: () => void): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    release();
  };
}

export class CampusRequestPolicy {
  private active = 0;
  private readonly waiters: Waiter[] = [];
  private nextStartAt = 0;
  private blockedReason: string | undefined;

  constructor(private readonly options: CampusRequestPolicyOptions) {
    if (options.maxConcurrent !== 1) {
      throw new Error('La concurrencia al Campus está fijada en 1 para aislar las cancelaciones.');
    }
    if (!Number.isSafeInteger(options.minIntervalMs) || options.minIntervalMs < 0 || options.minIntervalMs > 30000) {
      throw new Error('minIntervalMs debe ser un entero entre 0 y 30000.');
    }
    if (!Number.isSafeInteger(options.maxQueued) || options.maxQueued < 0 || options.maxQueued > 32) {
      throw new Error('maxQueued debe ser un entero entre 0 y 32.');
    }
  }

  static fromEnvironment(): CampusRequestPolicy {
    return new CampusRequestPolicy({
      maxConcurrent: configuredInteger(process.env.UTN_MCP_MAX_CONCURRENT_REQUESTS, 1, 'UTN_MCP_MAX_CONCURRENT_REQUESTS', 1, 1),
      minIntervalMs: configuredInteger(process.env.UTN_MCP_MIN_REQUEST_INTERVAL_MS, 1000, 'UTN_MCP_MIN_REQUEST_INTERVAL_MS', 0, 30000),
      maxQueued: configuredInteger(process.env.UTN_MCP_MAX_QUEUED_REQUESTS, 8, 'UTN_MCP_MAX_QUEUED_REQUESTS', 0, 32)
    });
  }

  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    this.throwIfBlocked();
    this.throwIfAborted(signal);
    const release = await this.acquire(signal);
    try {
      this.throwIfBlocked();
      this.throwIfAborted(signal);
      const now = Date.now();
      const scheduledStart = Math.max(now, this.nextStartAt);
      this.nextStartAt = scheduledStart + this.options.minIntervalMs;
      if (scheduledStart > now) {
        await this.waitForStart(scheduledStart - now, signal);
      }
      this.throwIfBlocked();
      this.throwIfAborted(signal);
      return await operation();
    } finally {
      release();
    }
  }

  block(reason: 'authentication' | 'authorization' | 'rate-limit' | 'security-challenge'): void {
    this.blockedReason ||= reason;
  }

  assertAvailable(): void {
    this.throwIfBlocked();
  }

  get queuedCount(): number {
    return this.waiters.length;
  }

  private throwIfBlocked(): void {
    if (!this.blockedReason) return;
    const message = this.blockedReason === 'authentication'
      ? 'Se detuvieron las solicitudes al Campus por una respuesta de autenticación. Revisá la sesión y reiniciá el MCP después de volver a iniciar sesión.'
      : this.blockedReason === 'authorization'
        ? 'Se detuvieron las solicitudes al Campus por una respuesta de permisos (403). No se volverá a consultar en esta sesión del MCP.'
        : this.blockedReason === 'rate-limit'
          ? 'El Campus respondió HTTP 429. Se detuvieron las solicitudes; esperá y revisá el Campus antes de reiniciar el MCP.'
          : 'El Campus presentó un desafío o bloqueo de seguridad. Se detuvieron las solicitudes; no se intentará evadirlo.';
    throw new Error(message);
  }

  private acquire(signal?: AbortSignal): Promise<() => void> {
    if (this.active < this.options.maxConcurrent) {
      this.active += 1;
      return Promise.resolve(this.makeRelease());
    }
    if (this.waiters.length >= this.options.maxQueued) {
      throw new Error('Se alcanzó el límite local de solicitudes en espera al Campus. Esperá a que terminen las consultas activas.');
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject, signal };
      if (signal) {
        waiter.onAbort = () => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error('La solicitud al Campus fue cancelada por el cliente MCP.'));
        };
        signal.addEventListener('abort', waiter.onAbort, { once: true });
      }
      this.waiters.push(waiter);
      if (signal?.aborted) waiter.onAbort?.();
    });
  }

  private makeRelease(): () => void {
    return releaseOnce(() => {
      while (this.waiters.length) {
        const next = this.waiters.shift()!;
        if (next.onAbort) next.signal?.removeEventListener('abort', next.onAbort);
        if (next.signal?.aborted) {
          next.reject(new Error('La solicitud al Campus fue cancelada por el cliente MCP.'));
          continue;
        }
        next.resolve(this.makeRelease());
        return;
      }
      this.active -= 1;
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) throw new Error('La solicitud al Campus fue cancelada por el cliente MCP.');
  }

  private waitForStart(delayMs: number, signal?: AbortSignal): Promise<void> {
    if (!signal) return new Promise(resolve => setTimeout(resolve, delayMs));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, delayMs);
      const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('La solicitud al Campus fue cancelada por el cliente MCP.'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      if (signal.aborted) onAbort();
    });
  }
}

export const campusRequestPolicy = CampusRequestPolicy.fromEnvironment();

const READ_ONLY_AJAX_METHODS = new Set([
  'core_course_get_enrolled_courses_by_timeline_classification',
  'core_courseformat_get_state',
  'core_files_get_files'
]);

export function isReadOnlyCampusPost(url: URL, postData: string | null): boolean {
  if (url.pathname === '/repository/draftfiles_ajax.php' && ['list', 'dir'].includes(url.searchParams.get('action') || '')) {
    return true;
  }
  if (url.pathname === '/repository/repository_ajax.php' && url.searchParams.get('action') === 'list') {
    return true;
  }
  if (url.pathname !== '/lib/ajax/service.php') return false;
  try {
    const payload: unknown = JSON.parse(postData || 'null');
    if (!Array.isArray(payload) || payload.length === 0) return false;
    return payload.every(item =>
      typeof item === 'object' && item !== null &&
      typeof (item as { methodname?: unknown }).methodname === 'string' &&
      READ_ONLY_AJAX_METHODS.has((item as { methodname: string }).methodname)
    );
  } catch {
    return false;
  }
}
