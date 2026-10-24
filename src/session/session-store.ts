import fs from 'node:fs';
import path from 'node:path';
import type { BrowserContext } from 'playwright';
import { ENCRYPTED_STORAGE_STATE_PATH, STORAGE_STATE_PATH, SESSION_DIR } from '../config.js';
import { protectWindowsSessionPath } from './windows-acl.js';
import { protectWindowsSessionData, unprotectWindowsSessionData } from './windows-dpapi.js';
import { inspectSessionFile } from './session-files.js';

type PlaywrightStorageState = Awaited<ReturnType<BrowserContext['storageState']>>;
const MAX_STORAGE_STATE_BYTES = 4 * 1024 * 1024;
const MAX_ENCRYPTED_STATE_BYTES = 7 * 1024 * 1024;

export class SessionStore {
  private static existingSessionProtected = false;
  /**
   * Comprueba si el archivo storageState existe y no está vacío.
   */
  static exists(): boolean {
    if (process.platform === 'win32'
      && inspectSessionFile(ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists) return true;
    return inspectSessionFile(STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES).exists;
  }

  /**
   * Asegura que exista el directorio .session
   */
  static ensureSessionDir(): void {
    let stats: fs.Stats | undefined;
    try {
      stats = fs.lstatSync(SESSION_DIR);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error('No se pudo comprobar la ubicación local de la sesión.');
      }
    }
    if (!stats) {
      fs.mkdirSync(SESSION_DIR, { recursive: true, mode: 0o700 });
      stats = fs.lstatSync(SESSION_DIR);
    }
    if (!stats.isDirectory() || stats.isSymbolicLink()) {
      throw new Error('La ubicación local de la sesión no es un directorio.');
    }
    if (process.platform === 'win32') {
      protectWindowsSessionPath(SESSION_DIR, true);
    } else {
      try {
        fs.chmodSync(SESSION_DIR, 0o700);
      } catch {
        throw new Error('No se pudieron restringir los permisos del directorio de sesión.');
      }
    }
  }

  static protectSessionFile(): void {
    const sessionFiles = [
      [STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES],
      [ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES]
    ] as const;
    for (const [filePath, maxBytes] of sessionFiles) {
      if (!inspectSessionFile(filePath, maxBytes).exists) continue;
      if (process.platform === 'win32') {
        protectWindowsSessionPath(filePath, false);
      } else {
        try {
          fs.chmodSync(filePath, 0o600);
        } catch {
          throw new Error('No se pudieron restringir los permisos del archivo de sesión.');
        }
      }
    }
  }

  /** Returns encrypted DPAPI state in memory, or the legacy JSON path without migrating it. */
  static getPlaywrightStorageState(): string | PlaywrightStorageState {
    if (process.platform === 'win32'
      && inspectSessionFile(ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists) {
      try {
        const envelope = fs.readFileSync(ENCRYPTED_STORAGE_STATE_PATH, 'utf8');
        const state = JSON.parse(unprotectWindowsSessionData(envelope)) as Partial<PlaywrightStorageState>;
        if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) {
          throw new Error('Invalid storage state shape.');
        }
        return state as PlaywrightStorageState;
      } catch {
        throw new Error('No se pudo cargar el estado local cifrado para esta cuenta de Windows.');
      }
    }
    inspectSessionFile(STORAGE_STATE_PATH, MAX_STORAGE_STATE_BYTES);
    return STORAGE_STATE_PATH;
  }

  /** Persists new Windows sessions with CurrentUser DPAPI; never migrates an existing JSON file. */
  static save(storageState: PlaywrightStorageState): void {
    SessionStore.ensureSessionDir();
    SessionStore.protectSessionFile();
    const encrypted = process.platform === 'win32';
    const targetPath = encrypted ? ENCRYPTED_STORAGE_STATE_PATH : STORAGE_STATE_PATH;
    const serialized = JSON.stringify(storageState);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STORAGE_STATE_BYTES) {
      throw new Error('El estado local supera el límite de 4 MiB.');
    }
    const contents = encrypted ? protectWindowsSessionData(serialized) : serialized;
    const temporaryPath = path.join(SESSION_DIR, `storageState.tmp-${process.pid}-${Date.now()}`);

    try {
      fs.writeFileSync(temporaryPath, contents, { flag: 'wx', mode: 0o600 });
      if (process.platform === 'win32') protectWindowsSessionPath(temporaryPath, false);
      else fs.chmodSync(temporaryPath, 0o600);
      fs.renameSync(temporaryPath, targetPath);
      SessionStore.existingSessionProtected = true;
    } catch {
      try {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
      } catch {
        // Preserve the original failure and never report a temporary path.
      }
      throw new Error(encrypted
        ? 'No se pudo guardar la sesión cifrada en Windows; la sesión anterior se conservó.'
        : 'No se pudo guardar la sesión local; la sesión anterior se conservó.');
    }
  }

  /** Tightens filesystem permissions without opening or rewriting stored session contents. */
  static protectExistingSession(): void {
    if (SessionStore.existingSessionProtected) return;
    if (!SessionStore.exists()) return;
    SessionStore.ensureSessionDir();
    SessionStore.protectSessionFile();
    SessionStore.existingSessionProtected = true;
  }

  /**
   * Obtiene la ruta al archivo de estado.
   */
  static getStoragePath(): string {
    if (process.platform === 'win32'
      && inspectSessionFile(ENCRYPTED_STORAGE_STATE_PATH, MAX_ENCRYPTED_STATE_BYTES).exists) {
      return ENCRYPTED_STORAGE_STATE_PATH;
    }
    return STORAGE_STATE_PATH;
  }

  /**
   * Borra la sesión local en caso de expiración o cierre manual.
   */
  static clear(): void {
    try {
      for (const filePath of [STORAGE_STATE_PATH, ENCRYPTED_STORAGE_STATE_PATH]) {
        try {
          fs.lstatSync(filePath);
          fs.unlinkSync(filePath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      SessionStore.existingSessionProtected = false;
    } catch {
      throw new Error('No se pudo eliminar la sesión local. Verificá los permisos del archivo y volvé a intentar.');
    }
  }
}
