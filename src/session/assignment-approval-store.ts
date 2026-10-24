import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SESSION_DIR } from '../config.js';
import { protectWindowsSessionPath } from './windows-acl.js';
import { protectWindowsSessionData, unprotectWindowsSessionData } from './windows-dpapi.js';
import { inspectSessionFile } from './session-files.js';

export type AssignmentSubmissionAction = 'save_draft' | 'submit_final';

export interface AssignmentSubmissionPlan {
  assignmentId: string;
  editUrl: string;
  courseName: string;
  assignmentName: string;
  dueDate?: string;
  currentSubmissionStatus?: string;
  currentLastModified?: string;
  action: AssignmentSubmissionAction;
  textContent: string;
  attachments: Array<{ path: string; name: string; size: number; sha256: string }>;
  supportsFileSubmission: boolean;
  supportsOnlineText: boolean;
  maxFiles?: number;
  maxFileBytes?: number;
  allowedFileTypes?: string[];
}

interface ApprovalRecord {
  version: 1;
  id: string;
  fingerprint: string;
  createdAt: number;
  expiresAt: number;
  approvedAt?: number;
  approvalExpiresAt?: number;
  state: 'pending' | 'approved' | 'consumed' | 'rejected';
  plan: AssignmentSubmissionPlan;
}

export interface ApprovalStoreOptions {
  directory: string;
  extension?: '.json' | '.dpapi';
  encode?: (json: string) => string;
  decode?: (data: string) => string;
  protectPath?: (targetPath: string, isDirectory: boolean) => void;
  now?: () => number;
  ttlMs?: number;
  approvalTtlMs?: number;
}

const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function fingerprintAssignmentPlan(plan: AssignmentSubmissionPlan): string {
  const canonicalPlan = {
    assignmentId: plan.assignmentId,
    editUrl: plan.editUrl,
    courseName: plan.courseName,
    assignmentName: plan.assignmentName,
    dueDate: plan.dueDate || '',
    currentSubmissionStatus: plan.currentSubmissionStatus || '',
    currentLastModified: plan.currentLastModified || '',
    action: plan.action,
    textContent: plan.textContent,
    supportsFileSubmission: plan.supportsFileSubmission,
    supportsOnlineText: plan.supportsOnlineText,
    maxFiles: plan.maxFiles || 0,
    maxFileBytes: plan.maxFileBytes || 0,
    allowedFileTypes: plan.allowedFileTypes || [],
    attachments: plan.attachments.map(file => ({
      path: path.resolve(file.path),
      name: file.name,
      size: file.size,
      sha256: file.sha256.toLowerCase()
    }))
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPlan), 'utf8').digest('hex');
}

export class AssignmentApprovalStore {
  private readonly extension: '.json' | '.dpapi';
  private readonly encode: (json: string) => string;
  private readonly decode: (data: string) => string;
  private readonly protectPath: (targetPath: string, isDirectory: boolean) => void;
  private readonly now: () => number;

  constructor(private readonly options: ApprovalStoreOptions) {
    this.extension = options.extension || '.json';
    this.encode = options.encode || (value => value);
    this.decode = options.decode || (value => value);
    this.protectPath = options.protectPath || (() => undefined);
    this.now = options.now || Date.now;
  }

  static local(): AssignmentApprovalStore {
    const windows = process.platform === 'win32';
    return new AssignmentApprovalStore({
      directory: path.join(SESSION_DIR, 'assignment-approvals'),
      extension: windows ? '.dpapi' : '.json',
      encode: windows ? protectWindowsSessionData : undefined,
      decode: windows ? unprotectWindowsSessionData : undefined,
      protectPath: windows ? protectWindowsSessionPath : undefined
    });
  }

  create(plan: AssignmentSubmissionPlan): { id: string; fingerprint: string; expiresAt: number } {
    this.ensureDirectory();
    const now = this.now();
    const id = crypto.randomUUID();
    const record: ApprovalRecord = {
      version: 1,
      id,
      fingerprint: fingerprintAssignmentPlan(plan),
      createdAt: now,
      expiresAt: now + (this.options.ttlMs ?? 15 * 60 * 1000),
      state: 'pending',
      plan
    };
    this.write(record);
    return { id, fingerprint: record.fingerprint, expiresAt: record.expiresAt };
  }

  getForHumanApproval(id: string): { plan: AssignmentSubmissionPlan; fingerprint: string; expiresAt: number } {
    const record = this.read(id);
    if (record.state !== 'pending' || record.expiresAt <= this.now()) {
      throw new Error('La preparación de entrega ya no está pendiente o venció. Prepará una nueva.');
    }
    return { plan: record.plan, fingerprint: record.fingerprint, expiresAt: record.expiresAt };
  }

  getApprovedPlan(id: string): { plan: AssignmentSubmissionPlan; fingerprint: string; approvalExpiresAt: number } {
    return this.withLock(id, () => {
      const record = this.read(id);
      if (record.state !== 'approved' || !record.approvalExpiresAt || record.approvalExpiresAt <= this.now()) {
        if (record.state === 'approved') {
          record.state = 'rejected';
          this.write(record);
        }
        throw new Error('No hay una aprobación humana vigente para esta operación.');
      }
      return { plan: record.plan, fingerprint: record.fingerprint, approvalExpiresAt: record.approvalExpiresAt };
    });
  }

  approve(id: string, typedChallenge: string): { approvalExpiresAt: number } {
    return this.withLock(id, () => {
      const record = this.read(id);
      if (record.state !== 'pending' || record.expiresAt <= this.now()) {
        throw new Error('La preparación de entrega ya no está pendiente o venció. Prepará una nueva.');
      }
      if (record.fingerprint !== fingerprintAssignmentPlan(record.plan)) {
        throw new Error('La preparación local no coincide con su huella y fue rechazada.');
      }
      const expectedChallenge = `APROBAR ${record.fingerprint.slice(0, 12)}`;
      if (typedChallenge !== expectedChallenge) {
        record.state = 'rejected';
        this.write(record);
        throw new Error('La confirmación no coincidió. La operación quedó rechazada.');
      }
      record.state = 'approved';
      record.approvedAt = this.now();
      record.approvalExpiresAt = record.approvedAt + (this.options.approvalTtlMs ?? 2 * 60 * 1000);
      this.write(record);
      return { approvalExpiresAt: record.approvalExpiresAt };
    });
  }

  reject(id: string): void {
    this.withLock(id, () => {
      const record = this.read(id);
      if (record.state !== 'pending' && record.state !== 'approved') return;
      record.state = 'rejected';
      this.write(record);
    });
  }

  consume(id: string, currentPlan: AssignmentSubmissionPlan): AssignmentSubmissionPlan {
    return this.withLock(id, () => {
      const record = this.read(id);
      if (record.state !== 'approved') throw new Error('No hay una aprobación humana vigente para esta operación.');
      if (!record.approvalExpiresAt || record.approvalExpiresAt <= this.now()) {
        record.state = 'rejected';
        this.write(record);
        throw new Error('La aprobación humana venció. Prepará y aprobá una operación nueva.');
      }
      const fingerprint = fingerprintAssignmentPlan(currentPlan);
      if (fingerprint !== record.fingerprint || fingerprintAssignmentPlan(record.plan) !== record.fingerprint) {
        record.state = 'rejected';
        this.write(record);
        throw new Error('Los argumentos o archivos cambiaron después de la aprobación. Prepará una operación nueva.');
      }
      record.state = 'consumed';
      this.write(record);
      return record.plan;
    });
  }

  private ensureDirectory(): void {
    fs.mkdirSync(this.options.directory, { recursive: true, mode: 0o700 });
    const stats = fs.lstatSync(this.options.directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) throw new Error('El almacén de aprobaciones no es un directorio regular.');
    if (process.platform !== 'win32') fs.chmodSync(this.options.directory, 0o700);
    this.protectPath(this.options.directory, true);
  }

  private filePath(id: string): string {
    if (!ID_PATTERN.test(id)) throw new Error('El identificador de aprobación no es válido.');
    return path.join(this.options.directory, `assignment-${id}${this.extension}`);
  }

  private read(id: string): ApprovalRecord {
    const filePath = this.filePath(id);
    inspectSessionFile(filePath, MAX_RECORD_BYTES);
    try {
      const json = this.decode(fs.readFileSync(filePath, 'utf8'));
      const record = JSON.parse(json) as ApprovalRecord;
      if (record.version !== 1 || record.id !== id || !ID_PATTERN.test(record.id) ||
          !['pending', 'approved', 'consumed', 'rejected'].includes(record.state) ||
          typeof record.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(record.fingerprint) ||
          record.fingerprint !== fingerprintAssignmentPlan(record.plan)) {
        throw new Error('Invalid approval record.');
      }
      return record;
    } catch {
      throw new Error('No se pudo validar la aprobación local de esta entrega.');
    }
  }

  private write(record: ApprovalRecord): void {
    const target = this.filePath(record.id);
    const serialized = this.encode(JSON.stringify(record));
    if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) throw new Error('La operación de entrega supera el límite local del almacén.');
    const temporary = `${target}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
    try {
      fs.writeFileSync(temporary, serialized, { flag: 'wx', mode: 0o600 });
      this.protectPath(temporary, false);
      fs.renameSync(temporary, target);
    } catch {
      try { fs.unlinkSync(temporary); } catch { /* retain the original failure */ }
      throw new Error('No se pudo guardar la aprobación local de forma segura.');
    }
  }

  private withLock<T>(id: string, action: () => T): T {
    this.ensureDirectory();
    const lockPath = `${this.filePath(id)}.lock`;
    let descriptor: number | undefined;
    try {
      descriptor = fs.openSync(lockPath, 'wx', 0o600);
      this.protectPath(lockPath, false);
    } catch {
      if (descriptor !== undefined) fs.closeSync(descriptor);
      try { fs.unlinkSync(lockPath); } catch { /* ignore a partial lock setup */ }
      throw new Error('La aprobación está siendo procesada o tiene un bloqueo local pendiente.');
    }
    try {
      return action();
    } finally {
      fs.closeSync(descriptor);
      try { fs.unlinkSync(lockPath); } catch { /* safe to leave a stale lock */ }
    }
  }
}

export const assignmentApprovalStore = AssignmentApprovalStore.local();
