# Plan de mejoras

Objetivo: que una persona **no técnica** pueda instalar el MCP, conectarlo a su cliente y estudiar con el material del Campus sin tocar una terminal. Este documento es un plan; nada de lo que sigue está implementado salvo lo indicado en "Ya hecho".

## Estado actual

| Ítem | Estado | Detalle |
| --- | --- | --- |
| 1.1 Asistente `setup-wizard` | ✅ | 5 pasos; elige las materias del cuatrimestre; no instala desde una copia temporal de `npx`. |
| 1.2 `doctor` | ✅ | Incluye la antigüedad de la sesión. |
| 1.3 Sesión vencida | ✅ | Aviso a partir de las 6 h (`doctor`, `status`, `session_status`); renovación desde el cliente con `start_login`. No se abre el login solo: abrir una ventana sin que la persona lo pida sería sorpresivo. |
| 2 `npx` | 🟡 | Sirve para el asistente, pero para conectar un cliente el MCP tiene que estar instalado (el asistente lo detecta y lo explica). |
| 2 `.mcpb` para Claude Desktop | ✅ | `npm run package:mcpb`. Falta publicarlo como asset de la Release y probarlo dentro de Claude Desktop. |
| 2 Instaladores nativos (`.exe`, `.pkg`, `.AppImage`) | ❌ | Requieren compilar y firmar en Windows y macOS: no es posible desde este entorno. El `.mcpb` cubre el caso de Claude Desktop. |
| 3.1 Perfil de materias | ✅ | `set_active_courses`; `get_deadlines`/`get_announcements` lo usan. |
| 3.2 Prompts listos | ✅ | 8 atajos. |
| 3.3 Resumen semanal | ✅ | `digest` con notificación; la programación se explica, no se instala sola. |
| 4.1 `study_pack` | ✅ | Archivos, carpetas, páginas y enlaces permitidos. |
| 4.2 Tablas en PDF | ✅ | Columnas y celdas vacías reconstruidas. |
| 4.2 Imágenes de diapositivas | ✅ | `get_pdf_page_image`. |
| 4.2 OCR automático | ❌ | El OCR sigue siendo opcional y con modelos locales; no se activa solo. |
| 4.3 Cobertura y trazabilidad | ✅ | `outline` por página + instrucciones en los prompts. |
| 4.4 Más formatos de estudio | ✅ | Prompts de práctica, tarjetas y plan. |
| 4.5 Enlaces externos | ✅ | `read_external`, con lista de sitios permitidos. |

## Ya hecho

### Rama `feat/wizard-y-doctor`

- **1.1 Asistente `setup-wizard` (alias `init`):** 5 pasos en español (equipo → sesión → clientes → prueba real → listo). Instala Chromium si falta, muestra el comando exacto cuando hace falta `sudo`, conecta Claude Code/Codex/OpenCode detectados y no pide credenciales. Opciones `--yes`, `--no-login`, `--no-register`.
- **1.2 `doctor`:** diagnóstico en una pantalla con la acción concreta por cada punto; sin rutas, usuarios ni datos del Campus en la salida; `--offline`.
- **1.3:** el inicio de sesión ya no pide Enter: detecta que entraste mirando la propia página (enlace «Cerrar sesión»), muestra un cartel en la ventana, guarda la sesión y la cierra sola; si falta el navegador, lo instala. Se prueba de punta a punta con un Moodle simulado.

### Rama `feat/mejoras-lectura-y-herramientas`

- Descarga de archivos robusta (páginas sin `Content-Length`, carpetas, nombres con acentos, sin avatares).
- Herramientas `get_course_contents`, `get_deadlines`, `get_announcements`, `get_quiz_info` y `download_file`.
- Materias por nombre, `list_courses` con `query`, `read_file` con `full`.
- Errores con causa y acción; `UTN_MCP_DEBUG=1`; `install-browser` sin `sudo` salvo `--with-deps`.
- Caché de archivos opcional (`UTN_MCP_CACHE=1`).

## Decisión de producto pendiente

¿Para quién es? (a) compañeros de UTN FRM que ya usan Claude/Codex, o (b) también gente que nunca instaló un cliente MCP. Con (b), la **Fase 2** pasa a ser la primera.

## Fase 1 — Instalación guiada

Elimina la mayor parte de la fricción y es código chico y testeable.

### 1.1 `utn-mcp-mendoza setup-wizard` (alias `init`) — ✅ hecho
Un solo comando, en español, que:
- Revisa Node, Chromium (versión correcta), almacén de contraseñas y entorno gráfico.
- Instala o repara lo que falte. Si hace falta `sudo`, imprime el comando exacto para copiar en vez de fallar.
- Abre el navegador para el login y **detecta solo** cuando se completó, sin pedir Enter.
- Detecta los clientes instalados (Claude Code, Claude Desktop, Codex, OpenCode, Cursor, VS Code) y ofrece registrar el MCP en cada uno.
- Cierra con una prueba real (lista las materias) y sugiere una primera pregunta.

Criterio de aceptación: una persona sin conocimientos técnicos llega a una consulta real siguiendo solo las pantallas, en Windows, macOS y Linux. Cada paso tiene prueba automatizada con el entorno simulado.

### 1.2 `utn-mcp-mendoza doctor` — ✅ hecho
Diagnóstico en una pantalla: sesión activa, Chromium correcto, cliente registrado, última consulta exitosa. Cada punto en rojo trae la acción concreta. La salida no incluye datos académicos, cookies ni rutas privadas, para poder pegarla en un reporte.

### 1.3 Renovación de sesión guiada — 🟡 parcial
Cuando la sesión vence: mensaje claro con la acción, o apertura del login. Aviso antes del vencimiento si se puede estimar.

## Fase 2 — Instalación sin terminal

El proyecto más largo y el que más cambia la adopción.

Opciones, de menor a mayor esfuerzo:
1. `npx utn-mcp-mendoza` sin instalación global.
2. Extensión `.mcpb` para Claude Desktop (doble clic).
3. Instaladores nativos (`.exe`, `.pkg`, `.AppImage`) que incluyan Node y Chromium.

Pendiente de decidir según la decisión de producto. Mantener la verificación de integridad (SHA-256) y las garantías de solo lectura.

## Fase 3 — Uso diario

### 3.1 Perfil de materias del cuatrimestre
Checklist en el wizard con las materias que se cursan ahora. `get_deadlines` y `get_announcements` revisan solo esas: más rápido que recorrer todas (hoy ~50 s con 12 materias por el ritmo de 1 consulta por segundo).

### 3.2 Prompts listos (función `prompts` de MCP)
Atajos visibles en el cliente: "Resumen de mi semana", "Qué entrego antes del viernes", "Resumime la unidad N de X", "Preparame el parcial de Y".

### 3.3 Aviso semanal opcional
Tarea programada que avisa qué vence en la semana, apoyada en `get_deadlines`.

## Fase 4 — Estudio con el material de la cátedra

### 4.1 `study_pack(materia, unidad)`
Junta todos los archivos de la unidad, los lee completos y devuelve el material ordenado con un índice de qué archivo aportó qué. Reemplaza los 5–6 pasos manuales de hoy.

### 4.2 Mejor lectura de PDFs
- Extractor que respete las columnas de las tablas (hoy `officeparser` las desordena).
- Imágenes de diapositivas disponibles para describir diagramas.
- OCR automático cuando una página no trae texto (modelos locales, sin descargas implícitas).

### 4.3 Control de cobertura y trazabilidad
- El resumen incluye la lista de temas del material y marca cuáles quedaron cubiertos.
- Cada punto indica archivo y página de origen.

### 4.4 Más formatos de estudio
Preguntas de práctica con respuestas (aprovechando los ejercicios del apunte), tarjetas de repaso y plan de estudio según la fecha del parcial.

### 4.5 Enlaces externos de la cátedra
Leer notebooks y repositorios públicos (GitHub, Colab) con aprobación explícita por sitio. Hoy quedan fuera.

## Orden recomendado

1. **1.1 + 1.2** (wizard y `doctor`).
2. **Fase 2** (instalación sin terminal).
3. **3.1 + 3.2** (perfil de materias y prompts).
4. **4.1 + 4.2** (`study_pack` y lectura de tablas), seguidos de **4.3** y **4.4**.
5. **3.3** y **4.5** al final.

## Reglas que no cambian

- Solo lectura por defecto; las escrituras en Moodle siguen deshabilitadas.
- Sin credenciales, cookies ni contenido académico en logs, reportes, fixtures ni caché por defecto.
- Cada herramienta nueva con tests y fixtures anonimizados; `npm run verify`, `npm run package:check` y `npm run build` en verde.
