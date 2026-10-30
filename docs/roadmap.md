# Plan de mejoras

Objetivo: que una persona **no técnica** pueda instalar el MCP, conectarlo a su cliente y estudiar con el material del Campus sin tocar una terminal.

## Estado

| Ítem | Estado | Detalle |
| --- | --- | --- |
| 1.1 Asistente `setup-wizard` | ✅ | Revisa el equipo, instala Chromium, inicia sesión, conecta los clientes detectados y hace una prueba real; elige las materias del cuatrimestre. No instala desde una copia temporal de `npx`. |
| 1.2 `doctor` | ✅ | Una pantalla con la acción por cada punto en rojo; sin rutas, usuarios ni datos del Campus; incluye la antigüedad de la sesión; `--offline`. |
| 1.3 Sesión vencida | ✅ | El login detecta solo que entraste y cierra la ventana. Aviso a partir de las 6 h (`doctor`, `status`, `session_status`); renovación con `start_login`. No se abre el login solo: una ventana que la persona no pidió sería sorpresiva. |
| 1.4 Login automático del Campus | ✅ | Con credenciales guardadas renueva la sesión sola (una vez por solicitud; sin insistir ni evadir captchas). Sin ellas, `login` manual. |
| 1.5 `login` unificado | ✅ | Una ventana con Campus, Autogestión y Webmail; guarda las cookies de los tres. |
| 1.6 Correo por Webmail | ✅ | Roundcube con las cookies de `login`; IMAP si hay credenciales, con respaldo por Webmail si IMAP rechaza la clave. Búsqueda de un solo criterio; falta medir cuánto dura la sesión. |
| 1.7 `install-deps` | ✅ | Linux, por pasos y con confirmación: apt (vía Playwright), dnf y pacman, con sudo, doas o pkexec. dnf, pacman, doas y pkexec sin probar. `install-browser` queda solo para Chromium. |
| 1.8 `--help` y `--version` | ✅ | Ayuda agrupada y por comando; flags desconocidas dan error; catálogo único en `src/cli/commands.ts`. |
| 2 `npx` | 🟡 | Sirve para el asistente, pero para conectar un cliente el MCP tiene que estar instalado (el asistente lo detecta y lo explica). |
| 2 `.mcpb` para Claude Desktop | 🟡 | `npm run package:mcpb`. Falta publicarlo como asset de la Release y probarlo dentro de Claude Desktop. |
| 2 Instaladores nativos (`.exe`, `.pkg`, `.AppImage`) | ❌ | Requieren compilar y firmar en Windows y macOS; no es posible desde este entorno. El `.mcpb` cubre Claude Desktop. |
| 3.1 Perfil de materias | ✅ | `set_active_courses`; `get_deadlines` y `get_announcements` lo usan (sin él, ~50 s con 12 materias por el ritmo de 1 consulta por segundo). |
| 3.2 Prompts listos | ✅ | 8 atajos. |
| 3.3 Resumen semanal | ✅ | `digest` con notificación; la programación se explica, no se instala sola. |
| 4.1 `study_pack` | ✅ | Archivos, carpetas, páginas y enlaces permitidos, con índice de qué archivo aportó qué. |
| 4.2 Lectura de PDF | 🟡 | ✅ Tablas con columnas y celdas vacías; ✅ imágenes de diapositivas (`get_pdf_page_image`); ❌ OCR automático: sigue siendo opcional y con modelos locales, sin descargas implícitas. |
| 4.3 Cobertura y trazabilidad | ✅ | `outline` por página y cada punto con archivo y página de origen, vía los prompts. |
| 4.4 Más formatos de estudio | ✅ | Prompts de práctica, tarjetas y plan. |
| 4.5 Enlaces externos | ✅ | `read_external`, con lista de sitios permitidos. |

## Pendiente

- **Decisión de producto:** ¿para quién es? (a) compañeros de UTN FRM que ya usan Claude/Codex, o (b) también gente que nunca instaló un cliente MCP. Con (b), la **Fase 2** (instalación sin terminal) pasa a ser la primera.
- **Fase 2:** publicar y probar el `.mcpb`; decidir si vale la pena `npx` sin instalación global o los instaladores nativos. Mantener la verificación SHA-256 y las garantías de solo lectura.
- **4.2:** OCR automático cuando una página no trae texto.
- **Sin probar** (detalle en [soporte.md](soporte.md)): dnf, pacman, doas, pkexec, DPAPI y macOS con cuentas reales, adjuntos del Webmail y duración de su sesión.

## Reglas que no cambian

- Solo lectura por defecto; las escrituras en Moodle siguen deshabilitadas.
- Sin credenciales, cookies ni contenido académico en logs, reportes, fixtures ni caché por defecto.
- Cada herramienta nueva con tests y fixtures anonimizados; `npm run verify`, `npm run package:check` y `npm run build` en verde.
