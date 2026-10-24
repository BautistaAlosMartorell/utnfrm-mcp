import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directorio raíz del proyecto
export const ROOT_DIR = path.resolve(__dirname, '..');

// Directorio y ruta para la sesión local
const projectSessionDir = path.join(ROOT_DIR, '.session');
const userStateDir = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'UTN MCP Mendoza')
  : path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'utn-mcp-mendoza');

export const SESSION_DIR = process.env.UTN_MCP_SESSION_DIR
  ? path.resolve(process.env.UTN_MCP_SESSION_DIR)
  : fs.existsSync(path.join(projectSessionDir, 'storageState.json'))
    ? projectSessionDir
    : userStateDir;
export const STORAGE_STATE_PATH = path.join(SESSION_DIR, 'storageState.json');
export const ENCRYPTED_STORAGE_STATE_PATH = path.join(SESSION_DIR, 'storageState.dpapi');

// URL base del Campus Virtual UTN Mendoza
export const CAMPUS_ORIGIN = 'https://campusvirtual.frm.utn.edu.ar';

// Rutas habituales de Moodle
export const PATHS = {
  login: '/login/index.php',
  dashboard: '/my/',
  courses: '/my/courses.php',
  profile: '/user/profile.php',
  courseView: (id: string | number) => `/course/view.php?id=${id}`,
  assignIndex: (id: string | number) => `/mod/assign/index.php?id=${id}`,
  assignView: (id: string | number) => `/mod/assign/view.php?id=${id}`,
  grades: (courseId: string | number) => `/grade/report/user/index.php?id=${courseId}`,
  forumIndex: (courseId: string | number) => `/mod/forum/index.php?id=${courseId}`,
  forumView: (forumId: string | number) => `/mod/forum/view.php?id=${forumId}`,
  forumDiscuss: (discussionId: string | number) => `/mod/forum/discuss.php?d=${discussionId}`,
  forumPost: '/mod/forum/post.php',
  participants: (courseId: string | number) => `/user/index.php?id=${courseId}`,
  calendarUpcoming: '/calendar/view.php?view=upcoming',
  calendarEvent: '/calendar/event.php',
  choiceView: (choiceId: string | number) => `/mod/choice/view.php?id=${choiceId}`,
  resourceView: (resourceId: string | number) => `/mod/resource/view.php?id=${resourceId}`,
  ajaxService: '/lib/ajax/service.php'
};

// Límites de espera configurables; valores de lectura, no una garantía contra bloqueos.
const configuredTimeout = process.env.UTN_MCP_REQUEST_TIMEOUT_MS;
const parsedTimeout = configuredTimeout === undefined ? 25000 : Number(configuredTimeout);
if (!Number.isSafeInteger(parsedTimeout) || parsedTimeout < 1000 || parsedTimeout > 120000) {
  throw new Error('UTN_MCP_REQUEST_TIMEOUT_MS debe ser un entero entre 1000 y 120000.');
}
export const DEFAULT_TIMEOUT_MS = parsedTimeout;
