import { z } from 'zod';
import { CONSULTAS, CONSULTA_NAMES } from '../sysacad/consultas.js';

// ==========================================
// Tipos de Dominio
// ==========================================

// Materia / Curso
export interface Course {
  id: string;
  name: string;
  shortname?: string;
  url: string;
  category?: string;
  /** true si está en el perfil de materias del cuatrimestre (solo aparece si hay un perfil definido). */
  active?: boolean;
}

// Tarea / Assignment
export interface AssignmentSummary {
  id: string;
  name: string;
  url: string;
  dueDate?: string;
  status?: string;
  grade?: string;
}

export interface Attachment {
  name: string;
  url: string;
  size?: string;
}

export interface AssignmentDetail {
  id: string;
  name: string;
  courseName?: string;
  descriptionHtml?: string;
  descriptionMarkdown: string;
  descriptionStatus: 'available' | 'not_provided';
  dueDate?: string;
  timeRemaining?: string;
  submissionStatus?: string;
  gradingStatus?: string;
  lastModified?: string;
  attachments: Attachment[];
  submission?: AssignmentSubmission;
  feedback?: AssignmentFeedback;
  url: string;
}

export interface AssignmentSubmission {
  files: Attachment[];
}

export interface AssignmentFeedback {
  grade?: string;
  gradedAt?: string;
  comment?: string;
  files: Attachment[];
}

// Recurso / Material
export interface ResourceItem {
  id: string;
  name: string;
  type: 'resource' | 'folder' | 'url' | 'page' | 'forum' | 'file' | 'assign' | 'choice' | 'quiz' | 'other';
  section?: string;
  url: string;
}

// Calificaciones / Gradebook
export interface GradeItem {
  id?: string;
  name: string;
  category?: string;
  grade: string;
  range?: string;
  percentage?: string;
  feedback?: string;
  weight?: string;
}

export interface CourseGradesReport {
  courseId: string;
  courseName: string;
  items: GradeItem[];
  courseTotal?: string;
}

// Perfil de Usuario (whoami)
export interface UserProfile {
  id?: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  timezone?: string;
  enrolledCourses?: { id: string; name: string }[];
  firstAccess?: string;
  lastAccess?: string;
}

// Participante / Compañero / Docente
export interface CourseParticipant {
  id: string;
  name: string;
  roles: string[];
  groups?: string[];
  lastAccess?: string;
  profileUrl: string;
}

// Foros y Discusiones
export interface ForumItem {
  id: string;
  name: string;
  description?: string;
  discussionsCount?: number;
  unreadCount?: number;
  url: string;
}

export interface DiscussionItem {
  id: string;
  title: string;
  author: string;
  createdDate?: string;
  createdDateIso?: string;
  repliesCount: number;
  lastPostDate?: string;
  lastPostDateIso?: string;
  lastPostAuthor?: string;
  pinned?: boolean;
  url: string;
}

export interface ForumPostItem {
  id: string;
  subject: string;
  author: string;
  authorPicture?: string;
  date: string;
  dateIso?: string;
  messageHtml?: string;
  messageMarkdown: string;
  attachments?: Attachment[];
  parentPostId?: string;
}

// Calendario
export interface CalendarEventItem {
  id: string;
  name: string;
  description?: string;
  date: string;
  eventType: 'course' | 'user' | 'site' | 'group' | 'other';
  courseName?: string;
  courseId?: string;
  url?: string;
}

// Contenido de curso por secciones
export interface CourseActivity {
  id: string;
  name: string;
  /** Tipo normalizado: assignment, forum, resource, folder, page, quiz, external_url, label, etc. */
  type: string;
  /** Nombre de módulo de Moodle tal como aparece en el Campus (assign, url, resource…). */
  modname: string;
  url?: string;
  description?: string;
  completion?: 'done' | 'pending';
  hidden?: boolean;
}

export interface CourseSectionContent {
  number: number;
  name: string;
  hidden?: boolean;
  summary?: string;
  /** false si la página no trajo el contenido de la sección (formato tiles) y hay que pedirla aparte. */
  rendered: boolean;
  activities: CourseActivity[];
}

// Cuestionarios
export interface QuizSummary {
  id: string;
  name: string;
  url: string;
  section?: string;
  closes?: string;
  closesIso?: string;
  grade?: string;
}

export interface QuizAttempt {
  number?: number;
  state?: string;
  started?: string;
  startedIso?: string;
  completed?: string;
  completedIso?: string;
  duration?: string;
  points?: string;
  grade?: string;
  reviewUrl?: string;
}

export interface QuizDetail {
  id: string;
  name: string;
  url: string;
  gradingMethod?: string;
  attemptsAllowed?: string;
  timeLimit?: string;
  opens?: string;
  opensIso?: string;
  closes?: string;
  closesIso?: string;
  passingGrade?: string;
  bestGrade?: string;
  canStartAttempt: boolean;
  attempts: QuizAttempt[];
  notes: string[];
}

// Consulta / Elección (mod_choice)
export interface ChoiceOption {
  id: string;
  text: string;
  selected: boolean;
  limit?: number;
  count?: number;
}

export interface ChoiceDetail {
  id: string;
  name: string;
  descriptionMarkdown: string;
  options: ChoiceOption[];
  hasAnswered: boolean;
  canChangeAnswer: boolean;
  url: string;
}

// Navegación Jerárquica Unificada (open)
export interface NavigationItem {
  id: string;
  name: string;
  type: 'course' | 'section' | 'module' | 'assignment' | 'forum' | 'discussion' | 'resource' | 'folder' | 'page' | 'choice' | 'quiz' | 'external_url' | 'other';
  url: string;
  detail?: string;
}

export interface NavigationResult {
  kind: 'course' | 'section' | 'assignment' | 'forum' | 'discussion' | 'resource' | 'folder' | 'quiz' | 'page' | 'choice' | 'generic';
  title: string;
  parent?: { name: string; url: string };
  breadcrumbs: string[];
  url: string;
  summary?: string;
  contentMarkdown?: string;
  children: NavigationItem[];
  metadata?: Record<string, any>;
}

// Archivos y Extracción
export interface ExtractedFileContent {
  filename: string;
  contentType: string;
  fileSize: number;
  fileSizeBytes: number;
  downloadUrl: string;
  extractedFormat: 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'odt' | 'ods' | 'rtf' | 'epub' | 'text' | 'image' | 'unsupported';
  totalPages?: number;
  currentPage?: number;
  currentOffset?: number;
  nextOffset?: number;
  contentLength?: number;
  pageSize?: number;
  content: string;
  truncated: boolean;
  extractionStatus: 'complete' | 'partial' | 'empty' | 'unsupported' | 'error';
  extractionWarnings: string[];
  ocrPerformed: boolean;
}

// ==========================================
// Schemas Zod para MCP Tools
// ==========================================

// Herramientas Existentes (Mantenidas 100% compatibles)
const COURSE_REF_DESCRIPTION = 'Materia: ID numérico (de list_courses), URL del curso o su nombre, por ejemplo "126" o "ciencia de datos". Si el nombre es ambiguo se informan las candidatas.';

export const ListCoursesInputSchema = z.object({
  query: z.string().trim().min(1).max(200).optional().describe('Filtro opcional por nombre (sin acentos ni mayúsculas), por ejemplo "inteligencia" o "redes neuronales"'),
  active_only: z.boolean().optional().describe('true devuelve solo las materias del perfil del cuatrimestre (ver set_active_courses)')
});

export const ListAssignmentsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe(COURSE_REF_DESCRIPTION)
});

export const GetAssignmentInputSchema = z.object({
  assignment_id: z.string().trim().min(1).max(2048).describe('ID numérico del módulo de la tarea o URL completa de la tarea')
});

export const ListResourcesInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe(COURSE_REF_DESCRIPTION)
});

// Navegación Unificada
export const OpenInputSchema = z.object({
  id_or_url: z.string().trim().min(1).max(2048).describe('ID o URL relativa/absoluta de cualquier elemento de Moodle: curso (/course/view.php?id=...), sección, tarea (/mod/assign/view.php?id=...), foro (/mod/forum/view.php?id=...), discusión (/mod/forum/discuss.php?d=...), recurso o material.'),
  section_id: z.string().trim().min(1).max(32).optional().describe('ID opcional de sección para filtrar contenidos de un curso')
});

// Lectura de Archivos
export const ReadFileInputSchema = z.object({
  ocr: z.boolean().optional().default(false).describe('Solicita OCR local para imagenes PDF; requiere modelos Tesseract locales y nunca los descarga.'),
  offset: z.number().int().min(0).max(10000000).optional().describe('Desplazamiento para continuar un fragmento PDF truncado'),
  url: z.string().trim().min(1).max(2048).describe('URL del recurso o archivo en el Campus Virtual (ej: /mod/resource/view.php?id=... o /pluginfile.php/...)'),
  page: z.number().int().positive().max(10000).optional().describe('Número de página o fragmento a leer, inicia en 1'),
  page_size: z.number().int().min(256).max(20000).optional().describe('Cantidad máxima de caracteres por fragmento (por defecto 8000; máximo 20000)'),
  format: z.enum(['markdown', 'text', 'raw']).optional().describe('Salida extraída: markdown conserva tablas; text y raw devuelven texto plano, no bytes binarios.'),
  full: z.boolean().optional().describe('true devuelve el documento completo en una sola respuesta (hasta 150.000 caracteres) en vez de fragmentos de 8.000; si todavía se trunca, continuar con offset.'),
  layout: z.boolean().optional().describe('PDF: true (por defecto) reconstruye las tablas con sus columnas y celdas vacías en Markdown; false usa texto lineal.')
});

// Calificaciones
export const GetGradesInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe(COURSE_REF_DESCRIPTION)
});

// Perfil de Usuario
export const WhoamiInputSchema = z.object({});

// Autogestión (Sysacad)
const SYSACAD_LEGAJO = z.string().trim().regex(/^\d{1,10}$/).optional()
  .describe('Número de legajo, solo si tu cuenta tiene más de uno. Por defecto el primer legajo de alumno.');

export const SysacadConsultarInputSchema = z.object({
  consulta: z.enum(CONSULTA_NAMES).describe('Qué consultar en Autogestión: ' + CONSULTA_NAMES.map(name => `${name} (${CONSULTAS[name].label})`).join(', ') + '.'),
  legajo: SYSACAD_LEGAJO
});

const MAIL_FOLDER = z.string().trim().min(1).max(100).default('INBOX').describe('Carpeta del correo: INBOX, Sent, Drafts o Trash.');

export const MailListMessagesInputSchema = z.object({
  folder: MAIL_FOLDER,
  limit: z.number().int().min(1).max(50).default(20).describe('Cantidad de mensajes, los más recientes primero (máximo 50).'),
  unseen_only: z.boolean().default(false).describe('true devuelve solo los no leídos.')
});

const MAIL_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato AAAA-MM-DD.');

export const MailSearchInputSchema = z.object({
  folders: z.array(z.string().trim().min(1).max(100)).max(10).optional().describe('Carpetas donde buscar. Si se omite, busca en todas (INBOX, Sent, Drafts, Trash).'),
  from: z.string().trim().min(1).max(200).optional().describe('Remitente (parte del nombre o de la dirección).'),
  to: z.string().trim().min(1).max(200).optional().describe('Destinatario.'),
  subject: z.string().trim().min(1).max(200).optional().describe('Texto en el asunto.'),
  text: z.string().trim().min(1).max(200).optional().describe('Texto en cualquier parte del mensaje (cabeceras y cuerpo).'),
  since: MAIL_DATE.optional().describe('Desde esta fecha (inclusive).'),
  before: MAIL_DATE.optional().describe('Antes de esta fecha.'),
  unseen_only: z.boolean().default(false).describe('true limita a los no leídos.'),
  limit: z.number().int().min(1).max(50).default(20).describe('Máximo de resultados, los más recientes primero (máximo 50).')
});

export const MailDeleteMessagesInputSchema = z.object({
  folder: MAIL_FOLDER,
  uids: z.array(z.number().int().positive()).min(1).max(50).describe('uids a mandar a la Papelera, tal como los devuelven mail_list_messages o mail_search (máximo 50 por llamada).')
});

export const MailRestoreMessagesInputSchema = z.object({
  uids: z.array(z.number().int().positive()).min(1).max(50).describe('uids de la Papelera a recuperar, tal como los devuelve mail_search con folders ["Trash"] (máximo 50 por llamada).'),
  folder: MAIL_FOLDER.describe('Carpeta de destino (por defecto INBOX).')
});

export const MailSetSeenInputSchema = z.object({
  folder: MAIL_FOLDER,
  uids: z.array(z.number().int().positive()).min(1).max(50).describe('uids a marcar (máximo 50 por llamada).'),
  seen: z.boolean().describe('true marca como leídos; false como no leídos.')
});

export const MailReadMessageInputSchema = z.object({
  uid: z.number().int().positive().describe('uid del mensaje, tal como lo devuelve mail_list_messages.'),
  folder: MAIL_FOLDER
});

export const AutogestionAvisosInputSchema = z.object({});

export const SysacadInscripcionEstadoInputSchema = z.object({ legajo: SYSACAD_LEGAJO });

// Participantes
export const ListParticipantsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe(COURSE_REF_DESCRIPTION),
  role: z.enum(['student', 'teacher', 'all']).optional().describe('Filtrar participantes por rol: "student", "teacher" o "all" (por defecto "all")')
});

// Foros
export const ListForumsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe(COURSE_REF_DESCRIPTION)
});

export const GetForumDiscussionsInputSchema = z.object({
  forum_id: z.string().trim().min(1).max(2048).describe('URL del foro tal como la devuelve list_forums (…/mod/forum/view.php?f=… o ?id=…), o el ID numérico del módulo (ej: "16227")')
});

export const GetDiscussionPostsInputSchema = z.object({
  discussion_id: z.string().describe('ID numérico de la discusión (ej: /mod/forum/discuss.php?d=5963 o "5963")')
});

// Foros - Vista previa; las escrituras permanecen bloqueadas en el servidor
export const ForumPostTopicInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe('ID numérico de la materia'),
  forum_id: z.string().trim().min(1).max(2048).describe('ID numérico del módulo del foro donde se abrirá el nuevo tema'),
  subject: z.string().trim().min(3).max(255).describe('Título o asunto del nuevo tema de discusión'),
  message: z.string().trim().min(5).max(100000).describe('Cuerpo del mensaje en texto o markdown'),
  confirm: z.boolean().default(false).describe('false prepara una vista previa. Las escrituras están deshabilitadas; true no publica mientras no exista aprobación humana independiente.')
});

export const ForumReplyInputSchema = z.object({
  discussion_id: z.string().trim().min(1).max(2048).describe('ID numérico de la discusión a la que se desea responder'),
  parent_post_id: z.string().trim().min(1).max(2048).optional().describe('ID opcional del mensaje al que se responde (por defecto responde al hilo principal)'),
  message: z.string().trim().min(3).max(100000).describe('Cuerpo de la respuesta'),
  confirm: z.boolean().default(false).describe('false prepara una vista previa. Las escrituras están deshabilitadas; true no publica mientras no exista aprobación humana independiente.')
});

// Calendario
export const ListCalendarEventsInputSchema = z.object({
  days_ahead: z.number().int().min(1).max(3650).optional().describe('Cantidad de días futuros a consultar en el calendario (máximo 10 años, por defecto 30)')
});

export const CalendarAddEventInputSchema = z.object({
  name: z.string().trim().min(3).max(255).describe('Nombre o título del evento / recordatorio'),
  description: z.string().max(5000).optional().describe('Descripción detallada o notas del evento'),
  date: z.string().trim().min(1).max(40).describe('Fecha y hora del evento en formato ISO o YYYY-MM-DD HH:mm'),
  course_id: z.string().trim().min(1).max(2048).optional().describe('ID numérico de la materia si es un evento asociado a un curso (opcional)'),
  confirm: z.boolean().default(false).describe('false prepara una vista previa. Las escrituras están deshabilitadas; true no crea el evento mientras no exista aprobación humana independiente.')
});

// Elecciones / Grupos (mod_choice)
export const GetChoiceInputSchema = z.object({
  choice_id: z.string().describe('ID numérico de la consulta/elección en Moodle (mod/choice/view.php?id=...)')
});

export const SubmitChoiceInputSchema = z.object({
  choice_id: z.string().describe('ID numérico del módulo mod_choice'),
  option_id: z.string().describe('ID numérico de la opción o grupo a elegir'),
  confirm: z.boolean().default(false).describe('false prepara una vista previa. Las escrituras están deshabilitadas; true no registra la opción mientras no exista aprobación humana independiente.')
});

// Entrega de Tareas
export const SubmitAssignmentInputSchema = z.object({
  assignment_id: z.string().describe('ID numérico de la tarea (mod/assign/view.php?id=...)'),
  stage: z.enum(['prepare', 'execute']).default('prepare').describe('prepare inspecciona el formulario y crea una operación pendiente; execute requiere approval_id aprobado localmente.'),
  submission_action: z.enum(['save_draft', 'submit_final']).optional().describe('Efecto solicitado. Si se omite, prepara save_draft. submit_final realiza además el envío formal, si Moodle lo permite.'),
  approval_id: z.string().uuid().optional().describe('Identificador de una operación aprobada desde la terminal local. Solo para stage=execute.'),
  text_content: z.string().max(100000).optional().default('').describe('Texto exacto de entrega en línea, si la tarea ofrece ese campo.'),
  attachment_paths: z.array(z.string().trim().min(1).max(4096)).max(10).optional().default([])
    .describe('Rutas locales de archivos que el proceso MCP local puede leer. Máximo 10 archivos.'),
  confirm: z.literal(false).optional().default(false).describe('Compatibilidad con clientes antiguos: debe ser false. true se rechaza y nunca autoriza una escritura.')
}).strict();

// Sesión y primeros pasos sin terminal
export const SessionStatusInputSchema = z.object({});
export const StartLoginInputSchema = z.object({});
export const InstallBrowserInputSchema = z.object({});

export const GetPdfPageImageInputSchema = z.object({
  url: z.string().trim().min(1).max(2048).describe('URL del PDF en el Campus (…/mod/resource/view.php?id=… o …/pluginfile.php/…)'),
  page: z.number().int().min(1).max(10000).describe('Número de página, desde 1'),
  scale: z.number().min(0.5).max(3).optional().describe('Zoom de la imagen (por defecto 1,5; el ancho máximo es 2000 px)')
});

export const ReadExternalInputSchema = z.object({
  url: z.string().trim().min(1).max(2048).describe('Enlace externo público (GitHub, Gist, Colab de GitHub) o el módulo URL del Campus que apunta a él (su ID o su URL /mod/url/view.php?id=…)')
});

export const StudyPackInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe('Materia: ID, URL o nombre (por ejemplo "informatica industrial")'),
  unit: z.string().trim().min(1).max(100).describe('Unidad: número ("4") o parte del nombre ("planificación"). Un número se interpreta como "Unidad 4".'),
  include_content: z.boolean().optional().describe('false devuelve solo el índice, el estado de lectura y los temas (sin el texto): útil para ver qué hay antes de pedirlo todo'),
  include_external: z.boolean().optional().describe('false omite los enlaces externos (por defecto se leen los de sitios permitidos)'),
  max_chars_per_source: z.number().int().min(1000).max(150000).optional().describe('Tope de caracteres por fuente (por defecto 60.000)'),
  max_total_chars: z.number().int().min(5000).max(400000).optional().describe('Tope total de caracteres de texto (por defecto 200.000)')
});

export const SetActiveCoursesInputSchema = z.object({
  courses: z.array(z.string().trim().min(1).max(200)).max(30).optional().describe('Materias que cursás este cuatrimestre (nombres o IDs). Si se omite, solo se consulta el perfil actual.'),
  clear: z.boolean().optional().describe('true borra el perfil: las herramientas vuelven a revisar todas las materias.')
});

// Contenido de curso, entregas, avisos, cuestionarios y descargas
export const GetCourseContentsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe(COURSE_REF_DESCRIPTION),
  section: z.string().trim().min(1).max(100).optional().describe('Opcional: número o parte del nombre de una sección ("3", "unidad 3") para leer solo esa'),
  include_labels: z.boolean().optional().describe('false omite las etiquetas de texto del curso (por defecto se incluyen)')
});

export const GetDeadlinesInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).optional().describe('Opcional: una sola materia (ID, URL o nombre). Si se omite se revisan todas.'),
  days_ahead: z.number().int().min(1).max(365).optional().describe('Ventana de días hacia adelante (por defecto 30)'),
  include_completed: z.boolean().optional().describe('true incluye lo ya entregado o con nota (por defecto no)'),
  include_overdue: z.boolean().optional().describe('false oculta lo vencido sin entregar (por defecto se muestra)'),
  overdue_days: z.number().int().min(1).max(3650).optional().describe('Hasta cuántos días atrás se muestra lo vencido sin entregar (por defecto 14)'),
  all_courses: z.boolean().optional().describe('true revisa todas las materias aunque haya un perfil del cuatrimestre')
});

export const GetAnnouncementsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).optional().describe('Opcional: una sola materia (ID, URL o nombre). Si se omite se revisan todas.'),
  limit: z.number().int().min(1).max(50).optional().describe('Cantidad máxima de avisos (por defecto 10)'),
  since: z.string().trim().min(8).max(40).optional().describe('Solo avisos con actividad desde esta fecha (2026-10-01 o ISO 8601)'),
  include_body: z.boolean().optional().describe('true agrega el texto de los 5 avisos más nuevos'),
  all_courses: z.boolean().optional().describe('true revisa todas las materias aunque haya un perfil del cuatrimestre')
});

export const GetQuizInfoInputSchema = z.object({
  quiz_id: z.string().trim().min(1).max(2048).optional().describe('ID o URL de un cuestionario: devuelve reglas, nota e intentos'),
  course_id: z.string().trim().min(1).max(2048).optional().describe('Materia (ID, URL o nombre): devuelve todos sus cuestionarios con cierre y nota')
});

export const DownloadFileInputSchema = z.object({
  url: z.string().trim().min(1).max(2048).describe('URL del recurso o archivo del Campus (…/mod/resource/view.php?id=… o …/pluginfile.php/…)'),
  filename: z.string().trim().min(1).max(200).optional().describe('Nombre opcional para el archivo local; se guarda siempre en la carpeta de descargas del MCP')
});
