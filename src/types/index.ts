import { z } from 'zod';

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
  url: string;
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
  repliesCount: number;
  lastPostDate?: string;
  url: string;
}

export interface ForumPostItem {
  id: string;
  subject: string;
  author: string;
  authorPicture?: string;
  date: string;
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
  kind: 'course' | 'section' | 'assignment' | 'forum' | 'discussion' | 'resource' | 'page' | 'choice' | 'generic';
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
export const ListCoursesInputSchema = z.object({});

export const ListAssignmentsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe('ID numérico de la materia (obtenido mediante list_courses, por ejemplo "126")')
});

export const GetAssignmentInputSchema = z.object({
  assignment_id: z.string().trim().min(1).max(2048).describe('ID numérico del módulo de la tarea o URL completa de la tarea')
});

export const ListResourcesInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe('ID numérico de la materia (obtenido mediante list_courses, por ejemplo "126")')
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
  format: z.enum(['markdown', 'text', 'raw']).optional().describe('Salida extra?da: markdown conserva tablas; text y raw devuelven texto plano, no bytes binarios.'),
});

// Calificaciones
export const GetGradesInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe('ID numérico de la materia para obtener el libro de calificaciones completo con notas y feedback de los docentes')
});

// Perfil de Usuario
export const WhoamiInputSchema = z.object({});

// Participantes
export const ListParticipantsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe('ID numérico de la materia para listar compañeros y profesores'),
  role: z.enum(['student', 'teacher', 'all']).optional().describe('Filtrar participantes por rol: "student", "teacher" o "all" (por defecto "all")')
});

// Foros
export const ListForumsInputSchema = z.object({
  course_id: z.string().trim().min(1).max(2048).describe('ID numérico de la materia para listar todos los foros disponibles')
});

export const GetForumDiscussionsInputSchema = z.object({
  forum_id: z.string().describe('ID numérico del módulo del foro (ej: /mod/forum/view.php?id=16227 o "16227")')
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
