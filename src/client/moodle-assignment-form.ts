import * as cheerio from 'cheerio';
import { CAMPUS_ORIGIN } from '../config.js';
import { resolveCampusUrl } from './campus-url.js';

const EDIT_LABEL = /agregar entrega|a[ñn]adir entrega|editar entrega|add submission|edit submission/i;
const SAVE_LABEL = /guardar cambios|save changes/i;

export interface AssignmentUploadContract {
  editUrl: string;
  formAction: string;
  fileManagerField?: string;
  saveButtonLabel: string;
  textField?: string;
  maxFiles?: number;
  maxFileBytes?: number;
  allowedFileTypes?: string[];
}

export function findAssignmentEditUrl(html: string, assignmentId: string): string | undefined {
  const $ = cheerio.load(html);
  const forms = $('form').toArray();
  for (const element of forms) {
    const form = $(element);
    if ((form.attr('method') || 'get').toLowerCase() !== 'get') continue;
    let action: string;
    try {
      action = resolveCampusUrl(form.attr('action') || '', CAMPUS_ORIGIN);
    } catch {
      continue;
    }
    if (new URL(action).pathname !== '/mod/assign/view.php') continue;
    const editButton = form.find('button,input[type="submit"]').toArray().find(button =>
      EDIT_LABEL.test($(button).text().trim() || String($(button).val() || ''))
    );
    if (!editButton) continue;

    const target = new URL(action);
    form.find('input[name],select[name],textarea[name]').each((_, field) => {
      const input = $(field);
      const name = input.attr('name');
      if (!name || /sesskey|csrf|token/i.test(name)) return;
      if ((input.attr('type') === 'checkbox' || input.attr('type') === 'radio') && !input.is(':checked')) return;
      target.searchParams.append(name, String(input.val() || ''));
    });
    const button = $(editButton);
    if (button.attr('name')) target.searchParams.append(button.attr('name')!, String(button.attr('value') || button.text().trim()));
    if (target.searchParams.get('id') !== assignmentId || target.searchParams.get('action')?.toLowerCase() !== 'editsubmission') continue;
    return resolveCampusUrl(target.href);
  }
  return undefined;
}

export function parseAssignmentUploadContract(html: string): AssignmentUploadContract | undefined {
  const $ = cheerio.load(html);
  for (const element of $('form').toArray()) {
    const form = $(element);
    if ((form.attr('method') || 'get').toLowerCase() !== 'post') continue;
    let formAction: string;
    try {
      formAction = resolveCampusUrl(form.attr('action') || '', CAMPUS_ORIGIN);
    } catch {
      continue;
    }
    if (new URL(formAction).pathname !== '/mod/assign/view.php') continue;

    const fileField = form.find('input[name="files_filemanager"]').length > 0 ||
      form.find('[data-fieldtype="filemanager"]').length > 0 ? 'files_filemanager' : undefined;
    const textField = form.find('textarea[name],input[name]').toArray().map(field => $(field).attr('name'))
      .find((name): name is string => typeof name === 'string' && /onlinetext.*\[text\]/i.test(name));
    if (!fileField && !textField) continue;
    const saveButton = form.find('button[name="submitbutton"],input[name="submitbutton"]').toArray().find(button =>
      SAVE_LABEL.test($(button).text().trim() || String($(button).val() || ''))
    );
    if (!saveButton) continue;

    const fileManager = form.find('[data-fieldtype="filemanager"], .filemanager').first();
    const rawMaxFiles = Number(fileManager.attr('data-maxfiles') || form.find('[name="files_filemanager"]').attr('data-maxfiles'));
    const rawMaxBytes = Number(fileManager.attr('data-maxbytes') || form.find('[name="files_filemanager"]').attr('data-maxbytes'));
    const rawTypes = fileManager.attr('data-accepted-types') || fileManager.attr('data-filetypes') ||
      form.find('[name="files_filemanager"]').attr('data-accepted-types');
    let allowedFileTypes: string[] | undefined;
    if (rawTypes) {
      try {
        const parsed: unknown = JSON.parse(rawTypes);
        if (Array.isArray(parsed) && parsed.every(value => typeof value === 'string')) allowedFileTypes = parsed;
      } catch {
        allowedFileTypes = rawTypes.split(/[\s,;]+/).filter(Boolean);
      }
    }
    return {
      editUrl: '',
      formAction,
      fileManagerField: fileField,
      saveButtonLabel: $(saveButton).text().trim() || String($(saveButton).val() || ''),
      textField,
      maxFiles: Number.isSafeInteger(rawMaxFiles) && rawMaxFiles > 0 ? rawMaxFiles : undefined,
      maxFileBytes: Number.isSafeInteger(rawMaxBytes) && rawMaxBytes > 0 ? rawMaxBytes : undefined,
      allowedFileTypes
    };
  }
  return undefined;
}
