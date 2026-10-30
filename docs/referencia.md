# Referencia

## Comandos

`utn-mcp-mendoza --help` lista todo, `<comando> --help` muestra las flags de uno y `--version` la versión. Una flag que el comando no conoce da error.

| Grupo | Comando | Qué hace | Flags |
| --- | --- | --- | --- |
| Empezar | `setup-wizard` (alias `init`) | Asistente: equipo, navegador, sesión y cliente. | `--yes` (valores por defecto), `--no-login`, `--no-register` (no toca tus clientes) |
| | `doctor` | Diagnóstico de equipo, Campus, Autogestión, correo y clientes. | `--offline` |
| Sesión | `login` | Inicia sesión en Campus, Autogestión y Webmail (cookies). | — |
| | `status`, `whoami` | Estado de la sesión del Campus y tu perfil. | — |
| | `logout`, `forget-credentials` | Borra la sesión o las credenciales guardadas. | — |
| Instalación | `install-browser` | Descarga Chromium (sin permisos). | `--with-deps` (corre antes `install-deps`), `-y`/`--yes` |
| | `install-deps` | Linux: bibliotecas de Chromium, por pasos y con confirmación. | `-y`/`--yes` |
| Cliente | `setup-claude`, `setup-codex`, `setup-opencode` | Registran el MCP en ese cliente. | `--print` |
| | `setup` | Imprime la configuración JSON de otros clientes. | — |
| Uso | `start` (o sin argumentos) | Servidor MCP por stdio. | — |
| | `digest` | Qué vence en los próximos días, lo vencido sin entregar y avisos nuevos. | `--days=<n>` (por defecto 7), `--notify` (notificación del sistema: `notify-send` en Linux, macOS), `--json`, `--all-courses`, `--schedule-help` (cómo programarlo con cron o el Programador de tareas; no instala nada) |
| | `test`, `approve-assignment <id>` | Comprueba lecturas; aprueba una entrega desde una terminal local. | — |

## Variables de entorno

Todas opcionales.

| Variable | Efecto |
| --- | --- |
| `UTN_MCP_DEBUG=1` | Detalle técnico (sin URLs ni credenciales) cuando falla un comando. |
| `UTN_MCP_CACHE=1` | Guarda en disco los archivos descargados. **Desactivada** por defecto: deja material académico sin cifrar. |
| `UTN_MCP_CACHE_DIR` | Ruta absoluta de la caché (por defecto en la carpeta de sesión). Máximo 200 MiB; vence a los 14 días. |
| `UTN_MCP_EXTERNAL_ALLOW` | Hosts extra, separados por coma, que `read_external` y `study_pack` pueden leer. Por defecto solo GitHub, Gist y Colab en GitHub, sin cookies ni datos del Campus. |
| `UTN_MCP_DOWNLOAD_DIR` | Ruta absoluta de `download_file` (por defecto `~/Downloads/utn-mcp`). |
| `UTN_MCP_MIN_REQUEST_INTERVAL_MS` | Pausa mínima entre consultas al Campus (por defecto 1000). Con muchas materias, `get_deadlines` y `get_announcements` pueden devolver `partial: true`; pide las pendientes con `course_id`. |
