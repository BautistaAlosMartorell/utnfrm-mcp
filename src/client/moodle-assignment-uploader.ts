import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium, type Browser, type BrowserContext, type Locator, type Page, type Route } from 'playwright';
import { DEFAULT_TIMEOUT_MS, PATHS } from '../config.js';
import { SessionStore } from '../session/session-store.js';
import { resolveCampusUrl } from './campus-url.js';
import { sanitizeCampusErrorMessage } from './error-sanitizer.js';
import { assertAssignmentSubmissionsEnabled } from './assignment-submission-policy.js';
import { isReadOnlyCampusPost } from './campus-request-policy.js';
import { parseAssignmentUploadContract } from './moodle-assignment-form.js';

export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 100 * 1024 * 1024;

export interface PreparedAssignmentAttachment {
  path: string;
  name: string;
  size: number;
}

export type HashedAssignmentAttachment = PreparedAssignmentAttachment & { sha256: string };

export async function hashAssignmentAttachment(file: PreparedAssignmentAttachment): Promise<HashedAssignmentAttachment> {
  const before = fs.statSync(file.path);
  if (!before.isFile() || before.size !== file.size) throw new Error(`El archivo cambió desde la preparación: ${file.name}.`);
  const hash = crypto.createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file.path);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  const after = fs.statSync(file.path);
  if (!after.isFile() || after.size !== file.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) {
    throw new Error(`El archivo cambió mientras se calculaba su huella: ${file.name}.`);
  }
  return { ...file, sha256: hash.digest('hex') };
}

export async function hashAssignmentAttachments(files: PreparedAssignmentAttachment[]): Promise<HashedAssignmentAttachment[]> {
  const hashed: HashedAssignmentAttachment[] = [];
  for (const file of files) hashed.push(await hashAssignmentAttachment(file));
  return hashed;
}

export interface LoadedAssignmentAttachment extends HashedAssignmentAttachment {
  buffer: Buffer;
}

export function loadAssignmentAttachment(file: PreparedAssignmentAttachment): LoadedAssignmentAttachment {
  const before = fs.statSync(file.path);
  if (!before.isFile() || before.size !== file.size) throw new Error(`El archivo cambió desde la preparación: ${file.name}.`);
  const buffer = fs.readFileSync(file.path);
  const after = fs.statSync(file.path);
  if (!after.isFile() || after.size !== file.size || buffer.byteLength !== file.size ||
      before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) {
    throw new Error(`El archivo cambió mientras se validaba: ${file.name}.`);
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return { ...file, sha256, buffer };
}

export function prepareAssignmentAttachments(paths: string[]): PreparedAssignmentAttachment[] {
  if (paths.length > MAX_ATTACHMENT_COUNT) throw new Error(`Se permiten como máximo ${MAX_ATTACHMENT_COUNT} archivos por entrega.`);
  const files = paths.map(filePath => {
    const absolutePath = fs.realpathSync(filePath);
    const stats = fs.statSync(absolutePath);
    if (!stats.isFile()) throw new Error(`El adjunto no es un archivo normal: ${path.basename(filePath)}.`);
    if (stats.size === 0) throw new Error(`El archivo está vacío: ${path.basename(filePath)}.`);
    if (stats.size > MAX_ATTACHMENT_BYTES) throw new Error(`El archivo supera el límite local de 50 MiB: ${path.basename(filePath)}.`);
    return { path: absolutePath, name: path.basename(absolutePath), size: stats.size };
  });
  const names = new Set<string>();
  for (const file of files) {
    const key = file.name.toLocaleLowerCase();
    if (names.has(key)) throw new Error(`Hay dos adjuntos con el mismo nombre: ${file.name}.`);
    names.add(key);
  }
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
    throw new Error('El tamaño total de los adjuntos supera el límite local de 100 MiB.');
  }
  return files;
}

export interface AssignmentUploadResult {
  status: 'draft_saved' | 'submitted' | 'uncertain' | 'rejected' | 'failed';
  message: string;
  details: Record<string, unknown>;
}

type WritePhase = 'read' | 'upload' | 'save-draft' | 'final-submit';

async function guardRoute(route: Route, phase: WritePhase, writes: string[]): Promise<void> {
  const request = route.request();
  let url: URL;
  try { url = new URL(resolveCampusUrl(request.url())); }
  catch { await route.abort(); return; }
  const method = request.method().toUpperCase();
  if (method === 'GET' || method === 'HEAD') { await route.continue(); return; }
  if (method === 'POST' && isReadOnlyCampusPost(url, request.postData())) { await route.continue(); return; }
  if (method === 'POST' && phase === 'upload' && url.pathname === '/repository/repository_ajax.php' && url.searchParams.get('action') === 'upload') {
    writes.push('file-upload');
    await route.continue();
    return;
  }
  if (method === 'POST' && (phase === 'save-draft' || phase === 'final-submit') && url.pathname === '/mod/assign/view.php') {
    writes.push(phase);
    await route.continue();
    return;
  }
  await route.abort();
}

const rejected = (message: string): AssignmentUploadResult => ({ status: 'rejected', message, details: { write_attempted: false } });
const uncertain = (message: string, writes: string[], extra: Record<string, unknown> = {}): AssignmentUploadResult => ({
  status: 'uncertain', message, details: { write_attempted: writes.length > 0, write_steps_observed: writes.length, verified: false, ...extra }
});

export function isCampusLoginUrl(value: string): boolean {
  try { return /\/login\/index\.php$/.test(new URL(value).pathname); }
  catch { return false; }
}

export function classifyAssignmentWriteHttpStatus(status: number, allowsRedirect = true): 'accepted' | 'uncertain' {
  if (status >= 200 && status < 300) return 'accepted';
  if (allowsRedirect && status >= 300 && status < 400) return 'accepted';
  return 'uncertain';
}

async function postResponse(page: Page, click: () => Promise<void>): Promise<number> {
  const response = page.waitForResponse(item => {
    const request = item.request();
    try {
      return request.method() === 'POST' && new URL(request.url()).pathname === '/mod/assign/view.php';
    } catch { return false; }
  }, { timeout: DEFAULT_TIMEOUT_MS });
  await click();
  return (await response).status();
}

function includesText(actual: string, expected: string): boolean {
  const normalized = expected.replace(/\s+/g, ' ').trim();
  return !normalized || actual.replace(/\s+/g, ' ').includes(normalized);
}

export async function uploadAndSubmitAssignmentFiles(args: {
  assignmentId: string;
  editUrl: string;
  attachments: LoadedAssignmentAttachment[];
  textContent: string;
  action: 'save_draft' | 'submit_final';
}): Promise<AssignmentUploadResult> {
  assertAssignmentSubmissionsEnabled();
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  let page: Page | undefined;
  let phase: WritePhase = 'read';
  const writes: string[] = [];
  let finalSubmitAttempted = false;

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ storageState: await SessionStore.getPlaywrightStorageState() });
    page = await context.newPage();
    await page.route('**/*', route => guardRoute(route, phase, writes));
    const editUrl = resolveCampusUrl(args.editUrl);
    const assignmentUrl = resolveCampusUrl(PATHS.assignView(args.assignmentId));
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
    if (isCampusLoginUrl(page.url())) return rejected('La sesión del Campus expiró. No se modificó la entrega.');

    const contract = parseAssignmentUploadContract(await page.content());
    if (!contract || new URL(contract.formAction).searchParams.get('id') !== args.assignmentId) {
      return rejected('El formulario de edición cambió o no corresponde a la tarea aprobada.');
    }
    const submissionForm = page.locator('form').filter({ has: page.locator('[name="files_filemanager"], textarea[name^="onlinetext"], [contenteditable="true"]') });
    if (await submissionForm.count() !== 1) return rejected('No se pudo identificar un único formulario de entrega.');
    const form = submissionForm.first();
    const saveButton = form.getByRole('button', { name: /^(Guardar cambios|Save changes)$/i });
    if (await saveButton.count() !== 1 || !(await saveButton.isEnabled())) return rejected('El formulario no tiene un botón activo y único para guardar cambios.');

    let textEditor: Locator | undefined;
    if (args.textContent) {
      if (!contract.textField) return rejected('La aprobación contiene texto, pero Moodle ya no ofrece un campo de texto en línea.');
      const textareas = form.locator('textarea[name^="onlinetext"]:visible');
      const editors = form.locator('[contenteditable="true"]:visible');
      if (await textareas.count() === 1) textEditor = textareas;
      else if (await textareas.count() === 0 && await editors.count() === 1) textEditor = editors;
      else return rejected('El editor de texto no se pudo identificar sin ambigüedad antes de cualquier cambio.');
    }

    let manager = page.locator('.filemanager.fm-loaded').last();
    if (args.attachments.length) {
      if (!contract.fileManagerField) return rejected('La aprobación contiene archivos, pero Moodle ya no ofrece un gestor de archivos.');
      await page.waitForSelector('.filemanager.fm-loaded', { timeout: DEFAULT_TIMEOUT_MS });
      manager = page.locator('.filemanager.fm-loaded').last();
      const managerText = (await manager.innerText()).toLocaleLowerCase();
      if (args.attachments.some(file => managerText.includes(file.name.toLocaleLowerCase()))) {
        return rejected('Ya existe un archivo con ese nombre en el borrador actual. No se subió otra copia.');
      }
    }

    if (args.textContent) await textEditor!.fill(args.textContent);
    for (const file of args.attachments) {
      const addButton = manager.getByTitle('Agregar...');
      if (await addButton.count() !== 1) return writes.length ? uncertain('La carga quedó incompleta. No se reintentó.', writes) : rejected('No se encontró el selector de archivos esperado.');
      await addButton.click({ timeout: 10000 });
      const picker = page.locator('[role="dialog"]').filter({ has: page.locator('input[name="repo_upload_file"]') }).last();
      await picker.waitFor({ state: 'visible', timeout: 10000 });
      await picker.locator('input[name="repo_upload_file"]').setInputFiles({ name: file.name, mimeType: 'application/octet-stream', buffer: file.buffer });
      const uploadButton = picker.getByRole('button', { name: 'Subir este archivo', exact: true });
      if (await uploadButton.count() !== 1) return writes.length ? uncertain('La carga quedó incompleta. No se reintentó.', writes) : rejected('El selector no mostró el control esperado.');
      phase = 'upload';
      const uploadResponse = page.waitForResponse(response => {
        const request = response.request();
        try { const url = new URL(request.url()); return request.method() === 'POST' && url.pathname === '/repository/repository_ajax.php' && url.searchParams.get('action') === 'upload'; }
        catch { return false; }
      }, { timeout: DEFAULT_TIMEOUT_MS });
      await uploadButton.click();
      const result = await uploadResponse;
      if (classifyAssignmentWriteHttpStatus(result.status(), false) !== 'accepted') {
        return uncertain('Moodle respondió con error durante la carga. No se reintentó.', writes, { http_status: result.status() });
      }
      await manager.getByText(file.name, { exact: true }).waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT_MS });
      phase = 'read';
    }

    phase = 'save-draft';
    const saveStatus = await postResponse(page, () => saveButton.click());
    if (classifyAssignmentWriteHttpStatus(saveStatus) !== 'accepted') return uncertain('Moodle no confirmó el guardado del borrador. No se repitió.', writes, { http_status: saveStatus });
    phase = 'read';
    await page.goto(assignmentUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
    let statusText = (await page.locator('.submissionstatustable').allInnerTexts().catch(() => [])).join('\n');
    let body = await page.locator('body').innerText().catch(() => '');
    const filesVerified = args.attachments.every(file => statusText.toLocaleLowerCase().includes(file.name.toLocaleLowerCase()));
    const textVerified = includesText(statusText, args.textContent) || includesText(body, args.textContent);
    if (!filesVerified || !textVerified) return uncertain('Se guardó el formulario, pero la relectura no confirmó todos los archivos y el texto exactos. No se reintentó.', writes);
    if (args.action === 'save_draft') {
      if (/enviado para calificar|submitted for grading/i.test(statusText)) return uncertain('Moodle muestra un estado distinto del borrador solicitado; verificá la tarea manualmente.', writes);
      return { status: 'draft_saved', message: 'Moodle muestra el borrador guardado y se releen los archivos y el texto solicitados.', details: { write_attempted: true, verified: true, submitted: false } };
    }

    const finalButton = page.getByRole('button', { name: /^(Enviar tarea|Enviar para calificar|Submit assignment)$/i });
    if (await finalButton.count() !== 1 || !(await finalButton.isEnabled())) {
      return { status: 'draft_saved', message: 'El borrador está verificado, pero Moodle no ofrece un botón activo de envío formal.', details: { write_attempted: true, verified: true, submitted: false } };
    }
    phase = 'final-submit';
    finalSubmitAttempted = true;
    const finalStatus = await postResponse(page, () => finalButton.click());
    if (classifyAssignmentWriteHttpStatus(finalStatus) !== 'accepted') return uncertain('El envío formal tuvo una respuesta HTTP no concluyente. No se reintentó.', writes, { http_status: finalStatus, final_submit_attempted: true });
    await page.waitForTimeout(300);
    const confirmation = page.locator('form').filter({ has: page.getByRole('button', { name: /^(Confirmar|Confirm)$/i }) }).last();
    if (await confirmation.count() > 0) {
      const confirmationText = await confirmation.innerText().catch(() => '');
      const confirmButton = confirmation.getByRole('button', { name: /^(Confirmar|Confirm)$/i });
      if (!/confirmar.*(entrega|env[ií]o|submission)|submit.*confirm/i.test(confirmationText) || await confirmButton.count() !== 1) {
        return uncertain('El diálogo final no coincide con la confirmación de entrega esperada. No se continuó.', writes, { final_submit_attempted: true });
      }
      const confirmStatus = await postResponse(page, () => confirmButton.click());
      if (classifyAssignmentWriteHttpStatus(confirmStatus) !== 'accepted') return uncertain('La confirmación final tuvo una respuesta HTTP no concluyente. No se reintentó.', writes, { http_status: confirmStatus, final_submit_attempted: true });
    }

    phase = 'read';
    await page.goto(assignmentUrl, { waitUntil: 'domcontentloaded', timeout: DEFAULT_TIMEOUT_MS });
    statusText = (await page.locator('.submissionstatustable').allInnerTexts().catch(() => [])).join('\n');
    const submitted = /enviado para calificar|submitted for grading/i.test(statusText);
    const verifiedFiles = args.attachments.every(file => statusText.toLocaleLowerCase().includes(file.name.toLocaleLowerCase()));
    const verifiedText = includesText(statusText, args.textContent) || includesText(await page.locator('body').innerText().catch(() => ''), args.textContent);
    if (submitted && verifiedFiles && verifiedText) {
      return { status: 'submitted', message: 'Moodle confirma el envío formal al releer el estado, los archivos y el texto.', details: { write_attempted: true, final_submit_attempted: true, verified: true, submitted: true } };
    }
    return uncertain('El envío pudo procesarse, pero la relectura no confirmó su estado y contenido. No se reintentó.', writes, { final_submit_attempted: finalSubmitAttempted });
  } catch (error) {
    return writes.length || finalSubmitAttempted
      ? uncertain('La operación pudo haber llegado a Moodle, pero no se obtuvo una confirmación verificable. No se reintentó; revisá la tarea antes de actuar.', writes, { final_submit_attempted: finalSubmitAttempted })
      : { status: 'failed', message: sanitizeCampusErrorMessage(error instanceof Error ? error.message : 'No se pudo preparar la operación de entrega.'), details: { write_attempted: false } };
  } finally {
    await context?.close().catch(() => null);
    await browser?.close().catch(() => null);
  }
}
