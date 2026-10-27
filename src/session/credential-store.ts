import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { secrets } from 'just-secrets';
import { SESSION_DIR } from '../config.js';
import { SessionStore } from './session-store.js';
import { inspectSessionFile } from './session-files.js';
import { protectWindowsSessionData, unprotectWindowsSessionData } from './windows-dpapi.js';
import { protectWindowsSessionPath } from './windows-acl.js';

/** `email` es el usuario del correo institucional (IMAP entra con la direccion completa, no con el DNI). */
export type UtnCredentials = { username: string; password: string; email?: string };

const KEYRING_SERVICE = 'ar.edu.utn.frm.mcp';
const KEYRING_NAME = `utn-credentials-${createHash('sha256').update(path.resolve(SESSION_DIR)).digest('hex').slice(0, 24)}`;
const CREDENTIALS_PATH = path.join(SESSION_DIR, 'credentials.dpapi');
const MAX_CREDENTIALS_BYTES = 2048;

const STORE_UNAVAILABLE = 'No esta disponible el almacen seguro del sistema. Inicia una sesion de escritorio desbloqueada (Keychain en macOS o Secret Service en Linux) y volve a ejecutar el comando. No se guardaron las credenciales sin cifrar.';

function parse(serialized: string): UtnCredentials {
  const value = JSON.parse(serialized) as Partial<UtnCredentials>;
  if (typeof value.username !== 'string' || typeof value.password !== 'string' || !value.username || !value.password) {
    throw new Error('Invalid credentials shape.');
  }
  return { username: value.username, password: value.password, ...(typeof value.email === 'string' && value.email ? { email: value.email } : {}) };
}

/**
 * Credenciales UTN compartidas (Campus, Autogestion y correo usan el mismo usuario y clave).
 * Misma proteccion que SessionStore: DPAPI por usuario en Windows, Secret Service/Keychain en el resto.
 * Nunca se escriben sin cifrar; si el almacen del sistema no esta, falla en vez de degradar.
 */
export class CredentialStore {
  static async save(credentials: UtnCredentials): Promise<void> {
    if (!credentials.username || !credentials.password) throw new Error('Usuario y contraseña son obligatorios.');
    const serialized = JSON.stringify({ username: credentials.username, password: credentials.password, ...(credentials.email ? { email: credentials.email } : {}) });
    if (Buffer.byteLength(serialized, 'utf8') > MAX_CREDENTIALS_BYTES) throw new Error('Usuario o contraseña demasiado largos.');

    if (process.platform !== 'win32') {
      try { await secrets.set({ service: KEYRING_SERVICE, name: KEYRING_NAME, value: serialized }); }
      catch { throw new Error(STORE_UNAVAILABLE); }
      return;
    }

    SessionStore.ensureSessionDir();
    const temporaryPath = path.join(SESSION_DIR, `credentials.tmp-${process.pid}-${Date.now()}`);
    try {
      fs.writeFileSync(temporaryPath, protectWindowsSessionData(serialized), { flag: 'wx', mode: 0o600 });
      protectWindowsSessionPath(temporaryPath, false);
      fs.renameSync(temporaryPath, CREDENTIALS_PATH);
    } catch {
      try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch { /* Preserve the original failure. */ }
      throw new Error('No se pudieron guardar las credenciales cifradas en Windows; las anteriores se conservaron.');
    }
  }

  /** null si nunca se guardaron; lanza si existen pero no se pueden abrir (no se confunde con "faltan"). */
  static async get(): Promise<UtnCredentials | null> {
    if (process.platform !== 'win32') {
      let stored: string | null;
      try { stored = await secrets.get({ service: KEYRING_SERVICE, name: KEYRING_NAME }); }
      catch { throw new Error(STORE_UNAVAILABLE); }
      if (stored === null) return null;
      try { return parse(stored); }
      catch { throw new Error('Las credenciales guardadas estan danadas. Volve a cargarlas con el asistente de configuracion.'); }
    }

    if (!inspectSessionFile(CREDENTIALS_PATH, MAX_CREDENTIALS_BYTES * 4).exists) return null;
    try { return parse(unprotectWindowsSessionData(fs.readFileSync(CREDENTIALS_PATH, 'utf8'))); }
    catch { throw new Error('No se pudieron abrir las credenciales cifradas para esta cuenta de Windows. Volve a cargarlas con el asistente de configuracion.'); }
  }

  static async clear(): Promise<void> {
    try {
      if (process.platform !== 'win32') await secrets.delete({ service: KEYRING_SERVICE, name: KEYRING_NAME });
      else if (fs.existsSync(CREDENTIALS_PATH)) fs.unlinkSync(CREDENTIALS_PATH);
    } catch { throw new Error('No se pudieron eliminar las credenciales guardadas. Verifica los permisos y volve a intentar.'); }
  }
}
