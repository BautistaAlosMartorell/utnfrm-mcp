import fs from 'node:fs';
import path from 'node:path';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { secrets } from 'just-secrets';
import type { BrowserContext } from 'playwright';
import { ENCRYPTED_STORAGE_STATE_PATH, SECURE_STORAGE_STATE_PATH, STORAGE_STATE_PATH, SESSION_DIR } from '../config.js';
import { protectWindowsSessionPath } from './windows-acl.js';
import { protectWindowsSessionData, unprotectWindowsSessionData } from './windows-dpapi.js';
import { inspectSessionFile } from './session-files.js';

type PlaywrightStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
type SessionEnvelope = { version: 1; iv: string; tag: string; data: string };
const MAX_STORAGE_STATE_BYTES = 4 * 1024 * 1024;
const MAX_ENCRYPTED_STATE_BYTES = 7 * 1024 * 1024;
const KEYRING_SERVICE = 'ar.edu.utn.frm.mcp';
const KEYRING_NAME = `campus-session-encryption-key-${createHash('sha256').update(path.resolve(SESSION_DIR)).digest('hex').slice(0, 24)}`;

async function getSessionKey(create: boolean): Promise<Buffer> {
  try {
    const existing = await secrets.get({ service: KEYRING_SERVICE, name: KEYRING_NAME });
    if (existing !== null) {
      const key = Buffer.from(existing, 'base64url');
      if (key.length !== 32 || key.toString('base64url') !== existing) throw new Error('Invalid key');
      return key;
    }
    if (!create) throw new Error('Missing key');
    const key = randomBytes(32);
    await secrets.set({ service: KEYRING_SERVICE, name: KEYRING_NAME, value: key.toString('base64url') });
    return key;
  } catch {
    throw new Error('No esta disponible el almacen seguro de sesiones del sistema. Inicia una sesion de escritorio desbloqueada (Keychain en macOS o Secret Service en Linux) y volve a ejecutar el comando. No se guardo una copia sin cifrar.');
  }
}

function encryptState(serialized: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
  const envelope: SessionEnvelope = {
    version: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url')
  };
  return JSON.stringify(envelope);
}

function decryptState(contents: string, key: Buffer): string {
  const envelope = JSON.parse(contents) as Partial<SessionEnvelope>;
  if (envelope.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.tag !== 'string' || typeof envelope.data !== 'string') {
    throw new Error('Invalid encrypted state envelope.');
  }
  const iv = Buffer.from(envelope.iv, 'base64url');
  const tag = Buffer.from(envelope.tag, 'base64url');
  const encrypted = Buffer.from(envelope.data, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) throw new Error('Invalid encrypted state fields.');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export class SessionStore {
  private static existingSessionProtected = false;

  static exists(): boolean {
    if (process.platform === 'win32') {
      if (inspectSessionFile(ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists) return true;
      return inspectSessionFile(STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES).exists;
    }
    if (inspectSessionFile(STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES).exists) {
      throw new Error('Se encontro una sesion antigua sin cifrar. No se leera. Ejecuta utn-mcp-mendoza logout y luego login para crear una sesion protegida por el almacen del sistema.');
    }
    return inspectSessionFile(SECURE_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists;
  }

  static ensureSessionDir(): void {
    let stats: fs.Stats | undefined;
    try {
      stats = fs.lstatSync(SESSION_DIR);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo comprobar la ubicacion local de la sesion.');
    }
    if (!stats) {
      fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
      stats = fs.lstatSync(SESSION_DIR);
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('La ubicacion local de la sesion no es un directorio.');
    if (process.platform === 'win32') protectWindowsSessionPath(SESSION_DIR, true);
    else {
      try { fs.chmodSync(SESSION_DIR, 0o700); }
      catch { throw new Error('No se pudieron restringir los permisos del directorio de sesion.'); }
    }
  }

  static protectSessionFile(): void {
    const files = process.platform === 'win32'
      ? [[STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES], [ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES]] as const
      : [[SECURE_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES]] as const;
    for (const [filePath, maxBytes] of files) {
      if (!inspectSessionFile(filePath, maxBytes).exists) continue;
      if (process.platform === 'win32') protectWindowsSessionPath(filePath, false);
      else {
        try { fs.chmodSync(filePath, 0o600); }
        catch { throw new Error('No se pudieron restringir los permisos del archivo de sesion.'); }
      }
    }
  }

  static async getPlaywrightStorageState(): Promise<string | PlaywrightStorageState> {
    if (process.platform === 'win32'
      && inspectSessionFile(ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists) {
      try {
        const envelope = fs.readFileSync(ENCRYPTED_STORAGE_STATE_PATH, 'utf8');
        const state = JSON.parse(unprotectWindowsSessionData(envelope)) as Partial<PlaywrightStorageState>;
        if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw new Error('Invalid state shape.');
        return state as PlaywrightStorageState;
      } catch { throw new Error('No se pudo cargar el estado local cifrado para esta cuenta de Windows.'); }
    }
    if (process.platform === 'win32') {
      inspectSessionFile(STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES);
      return STORAGE_STATE_PATH;
    }
    if (!inspectSessionFile(SECURE_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists) {
      throw new Error('No se encontro una sesion local protegida. Ejecuta utn-mcp-mendoza login.');
    }
    try {
      const state = JSON.parse(decryptState(fs.readFileSync(SECURE_STORAGE_STATE_PATH, 'utf8'), await getSessionKey(false))) as Partial<PlaywrightStorageState>;
      if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw new Error('Invalid state shape.');
      return state as PlaywrightStorageState;
    } catch {
      throw new Error('No se pudo abrir la sesion cifrada. Desbloquea el almacen seguro del sistema; si continua, ejecuta logout y login para crear una nueva.');
    }
  }

  static async save(storageState: PlaywrightStorageState): Promise<void> {
    SessionStore.ensureSessionDir();
    SessionStore.protectSessionFile();
    const windowsEncrypted = process.platform === 'win32';
    const secureEncrypted = process.platform !== 'win32';
    if (secureEncrypted && inspectSessionFile(STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES).exists) {
      throw new Error('Se encontro una sesion antigua sin cifrar. Ejecuta utn-mcp-mendoza logout antes de iniciar una nueva sesion protegida.');
    }
    const targetPath = windowsEncrypted ? ENCRYPTED_STORAGE_STATE_PATH : secureEncrypted ? SECURE_STORAGE_STATE_PATH : STORAGE_STATE_PATH;
    const serialized = JSON.stringify(storageState);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_STATE_BYTES) throw new Error('El estado local supera el limite de 4 MiB.');
    const contents = windowsEncrypted
      ? protectWindowsSessionData(serialized)
      : secureEncrypted ? encryptState(serialized, await getSessionKey(true)) : serialized;
    const temporaryPath = path.join(SESSION_DIR, `storageState.tmp-${process.pid}-${Date.now()}`);
    try {
      fs.writeFileSync(temporaryPath, contents, { flag: 'wx', mode: 0o600 });
      if (process.platform === 'win32') protectWindowsSessionPath(temporaryPath, false);
      else fs.chmodSync(temporaryPath, 0o600);
      fs.renameSync(temporaryPath, targetPath);
      SessionStore.existingSessionProtected = true;
    } catch {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* Preserve the original failure. */ }
      throw new Error(windowsEncrypted
        ? 'No se pudo guardar la sesion cifrada en Windows; la sesion anterior se conservo.'
        : 'No se pudo guardar la sesion cifrada; la sesion anterior se conservo.');
    }
  }

  static protectExistingSession(): void {
    if (SessionStore.existingSessionProtected || !SessionStore.exists()) return;
    SessionStore.ensureSessionDir();
    SessionStore.protectSessionFile();
    SessionStore.existingSessionProtected = true;
  }

  static getStoragePath(): string {
    if (process.platform === 'win32' && inspectSessionFile(ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists) {
      return ENCRYPTED_STORAGE_STATE_PATH;
    }
    return process.platform === 'win32' ? STORAGE_STATE_PATH : SECURE_STORAGE_STATE_PATH;
  }

  static async clear(): Promise<void> {
    try {
      let hasSecureState = false;
      if (process.platform !== 'win32') {
        try { fs.lstatSync(SECURE_STORAGE_STATE_PATH); hasSecureState = true; }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      if (hasSecureState) await secrets.delete({ service: KEYRING_SERVICE, name: KEYRING_NAME });
      for (const filePath of [STORAGE_STATE_PATH, ENCRYPTED_STORAGE_STATE_PATH, SECURE_STORAGE_STATE_PATH]) {
        try { fs.lstatSync(filePath); fs.unlinkSync(filePath); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      SessionStore.existingSessionProtected = false;
    } catch { throw new Error('No se pudo eliminar la sesion local. Verifica los permisos del archivo y del almacen seguro, y vuelve a intentar.'); }
  }
}
