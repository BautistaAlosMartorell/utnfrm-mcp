# Uso

## Conectar tu cliente

| Cliente | Comando | Comprueba |
| --- | --- | --- |
| Codex | `utn-mcp-mendoza setup-codex` | `codex mcp list` |
| Claude Code | `utn-mcp-mendoza setup-claude` | `claude mcp list` |
| OpenCode | `utn-mcp-mendoza setup-opencode` | `opencode mcp list` |

Debe aparecer `utn-mendoza`; luego reinicia el cliente. Claude Code lo registra con alcance `user` y OpenCode en su configuración global. Con `--print` solo muestra el comando (también la línea completa si el cliente no está en el `PATH`). Si ya estaba registrado no lo reemplaza: quítalo antes (ver [Soporte](soporte.md#desinstalar)). Para Claude Desktop, Cursor o VS Code, `utn-mcp-mendoza setup` imprime la configuración JSON.

## Primera consulta

> Lista mis materias y las tareas próximas. Si no hay resultados, dime que la lista está vacía; si hubo un error de acceso, explícame cuál.

Solo aparece lo que tu cuenta puede ver: una lista vacía puede ser que no hay contenido; un error significa que la consulta no se completó.

## Herramientas

Además de las básicas (materias, tareas, archivos, notas, foros y calendario). Donde se pide una materia sirve su nombre («ciencia de datos») en lugar del ID, y las fechas van en ISO 8601 con la zona del Campus (UTC-03:00).

| Herramienta | Para qué sirve |
| --- | --- |
| `get_course_contents` | Todas las unidades de una materia con sus actividades, también en formato por mosaicos. |
| `get_deadlines` | Próximas entregas y cierres de cuestionarios, por fecha y con tu estado de entrega. |
| `get_announcements` | Avisos recientes del foro de novedades. |
| `get_quiz_info` | Reglas, nota e intentos de un cuestionario. Nunca inicia ni envía un intento. |
| `download_file` | Guarda un archivo del Campus en `~/Downloads/utn-mcp` sin sobrescribir nada. |
| `read_file` con `full: true` | Documento completo en una respuesta; en los PDF reconstruye las tablas. |
| `study_pack` | Todo el material de una unidad con índice de temas y estado de lectura. Base de los resúmenes. |
| `get_pdf_page_image` | Dibuja una página de PDF como imagen, para diagramas y fórmulas. |
| `read_external` | Lee notebooks y archivos públicos enlazados por la cátedra (GitHub, Gist, Colab en GitHub). |
| `session_status`, `start_login`, `install_browser` | Conectar Campus, Autogestión y Webmail sin terminal, desde tu cliente. `session_status` informa también si el correo funciona. |
| `set_active_courses` | Guarda tus materias del cuatrimestre para que las consultas generales vayan más rápido. |
| `sysacad_consultar` | Autogestión, solo lectura: exámenes aprobados y aplazados, plan, cursado, horarios, estado académico, correlatividades. |
| `sysacad_inscripcion_estado` | Dice si la inscripción a cursado está abierta. Solo mira. |
| `get_autogestion_avisos` | Avisos públicos de Autogestión (llamados, plazos, certificados). No requiere sesión. |
| `mail_list_messages`, `mail_read_message`, `mail_search` | Correo institucional: listar, leer y buscar por remitente, asunto, texto, fechas y no leídos, en una carpeta o en todas (por Webmail, ver los [límites](sesion.md#correo)). No marcan nada como leído. |
| `mail_delete_messages`, `mail_restore_messages`, `mail_set_seen` | Mover a la Papelera, recuperar y marcar leído o no leído. Piden permiso en cada llamada. |

## Atajos

Tu cliente los muestra como acciones (con `/` o en el menú de prompts):

| Atajo | Qué hace |
| --- | --- |
| `conectar_con_el_campus` | Instala el navegador e inicia sesión, sin terminal. |
| `resumen_de_mi_semana` | Qué vence en 7 días y qué avisos hay. |
| `que_entrego` | Pendientes hasta una fecha o cantidad de días. |
| `resumir_unidad` | Resumen de una unidad, con índice de cobertura y páginas de origen. |
| `preparar_parcial` | Temas, chuleta, preguntas de práctica y plan de estudio. |
| `practica_de_unidad`, `tarjetas_de_repaso`, `plan_de_estudio` | Preguntas con respuestas, tarjetas y plan día por día. |
