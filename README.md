# UTN FRM MCP

Beta multiplataforma para consultar el Campus Virtual, Autogestión (Sysacad) y el correo institucional de UTN Facultad Regional Mendoza desde Codex, Claude Code u OpenCode. Proyecto independiente y no oficial.

**Solo lectura en Moodle y Autogestión:** no entrega tareas, no publica en foros, no se inscribe a nada. En el correo solo puede mover mensajes a la Papelera, recuperarlos y marcarlos como leídos o no leídos; nunca envía ni borra definitivamente. Hay una hoja corta en [Inicio rápido](INICIO-RAPIDO.txt).

**¿Instalación en pocos pasos?** Una vez instalado el paquete (secciones 1 y 2, o la alternativa de npm), `utn-mcp-mendoza setup-wizard` hace el resto: revisa el equipo, abre el login, conecta tu cliente de IA y prueba que funciona.

## Antes de empezar

- **Windows, Linux o macOS.**
- **Node.js 22.13 o posterior** ([nodejs.org](https://nodejs.org/)). Abre una terminal nueva después de instalarlo.
- **Un cliente de IA con MCP ya instalado:** Codex, Claude Code u OpenCode.

Comprueba con `node --version` y `codex --version`, `claude --version` u `opencode --version`. Si un comando no se reconoce, cierra y vuelve a abrir la terminal.

## Alternativa: instalar desde npm

Si prefieres no descargar archivos, instala el paquete publicado en npm y salta a **3. Inicia sesión en el Campus**:

```bash
npm install --global utn-mcp-mendoza@beta
utn-mcp-mendoza install-browser
```

En Linux instala antes `libsecret-tools` y `gnome-keyring` (ver el bloque de Ubuntu/Debian del paso 2). Para actualizar más adelante: `npm install --global utn-mcp-mendoza@beta` y luego `utn-mcp-mendoza install-browser`. Si prefieres verificar el instalador con SHA-256, usa la descarga manual de abajo.

## 1. Descarga la beta

De la [Release v2.1.1](https://github.com/BautistaAlosMartorell/utnfrm-mcp/releases/tag/v2.1.1), sección **Assets**, descarga y guarda juntos en una carpeta `utn-mcp-beta` dentro de Descargas:

- `utn-mcp-mendoza-2.1.1.tgz`: el instalador.
- `utn-mcp-mendoza-2.1.1.tgz.sha256`: para verificarlo.
- `INICIO-RAPIDO.txt`: copia breve de estos pasos.

No hacen falta los enlaces **Source code**.

### Verificar el instalador (recomendado)

En la carpeta `utn-mcp-beta`. Debe dar `OK`; si no, vuelve a descargar.

**Windows — PowerShell**

```powershell
$esperado = (Get-Content .\utn-mcp-mendoza-2.1.1.tgz.sha256 -Raw).Trim().Split()[0]
$obtenido = (Get-FileHash .\utn-mcp-mendoza-2.1.1.tgz -Algorithm SHA256).Hash.ToLower()
if ($obtenido -eq $esperado) { "OK: instalador verificado" } else { "ERROR: vuelve a descargarlo" }
```

**Linux**

```bash
sha256sum -c utn-mcp-mendoza-2.1.1.tgz.sha256
```

**macOS**

```bash
shasum -a 256 -c utn-mcp-mendoza-2.1.1.tgz.sha256
```

## 2. Instala el MCP y Chromium

Abre una terminal en la carpeta y ejecuta solo el bloque de tu sistema. El segundo comando instala el navegador que el MCP usa para abrir el Campus y Autogestión.

**Windows — PowerShell**

```powershell
cd "$HOME\Downloads\utn-mcp-beta"
npm install --global .\utn-mcp-mendoza-2.1.1.tgz
utn-mcp-mendoza install-browser
```

**Linux — Ubuntu o Debian**

Necesita el almacén seguro de contraseñas (Secret Service) de una sesión de escritorio normal, desbloqueado. No funciona de forma segura en SSH, headless o WSL. En otras distribuciones instala el equivalente de estos paquetes.

```bash
cd ~/Downloads/utn-mcp-beta
sudo apt-get update
sudo apt-get install -y libsecret-tools gnome-keyring
npm install --global ./utn-mcp-mendoza-2.1.1.tgz
utn-mcp-mendoza install-browser
```

**macOS**

```bash
cd ~/Downloads/utn-mcp-beta
npm install --global ./utn-mcp-mendoza-2.1.1.tgz
utn-mcp-mendoza install-browser
```

Cuando macOS pregunte, permite que UTN FRM MCP use el Llavero de inicio de sesión.

> **Atajo: asistente guiado.** Ejecuta `utn-mcp-mendoza setup-wizard`. Revisa tu equipo, instala el navegador si falta, ofrece guardar tu usuario (DNI), contraseña y correo UTN cifrados (opcional), abre el Campus para iniciar sesión, conecta los clientes de IA que encuentre y termina con una prueba real. `--yes` acepta los valores por defecto, `--no-login` omite el inicio de sesión y `--no-register` no toca la configuración de tus clientes. Con el asistente puedes saltar los pasos 3 y 4.

## 3. Inicia sesión en el Campus

1. Ejecuta `utn-mcp-mendoza login`.
2. Escribe tu usuario y contraseña **solo en la ventana del Campus** que se abre. Al confirmar el acceso, la sesión se guarda y la ventana se cierra sola.
3. Comprueba con `utn-mcp-mendoza status`.

La sesión queda en el almacenamiento seguro del sistema y vence tras unas horas: vuelve a ejecutar `login` (o pide «renová mi sesión del Campus» a tu cliente, que usa `start_login`). No hace falta reiniciar el cliente de IA: el MCP detecta la sesión renovada y retoma solo. `logout` borra la sesión pero **no** la contraseña guardada; para eso es `forget-credentials`. La contraseña solo se guarda si la cargas en el asistente, cifrada por el sistema; `utn-mcp-mendoza forget-credentials` la elimina. Autogestión y el correo usan esas credenciales guardadas; el usuario del correo es la dirección completa que ves al entrar a Autogestión.

## 4. Conecta el servidor a tu cliente

| Cliente | Comando | Comprueba |
| --- | --- | --- |
| Codex | `utn-mcp-mendoza setup-codex` | `codex mcp list` |
| Claude Code | `utn-mcp-mendoza setup-claude` | `claude mcp list` |
| OpenCode | `utn-mcp-mendoza setup-opencode` | `opencode mcp list` |

Debe aparecer `utn-mendoza`. Luego cierra y vuelve a abrir el cliente. Claude Code lo registra con alcance `user` y OpenCode en su configuración global. Con `--print` solo muestra el comando; si el cliente no está en el `PATH`, también te da la línea completa. Si ya estaba registrado no lo reemplaza: quítalo antes (sección **Desinstalar**).

## 5. Prueba una consulta

> Lista mis materias y las tareas próximas. Si no hay resultados, dime que la lista está vacía; si hubo un error de acceso, explícame cuál.

Solo aparece lo que tu cuenta puede ver. Una lista vacía puede ser que no hay contenido; un error significa que la consulta no se completó.

## Herramientas

Además de las básicas (materias, tareas, archivos, notas, foros y calendario):

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
| `session_status`, `start_login`, `install_browser` | Conectar el Campus sin terminal, desde tu cliente. |
| `set_active_courses` | Guarda tus materias del cuatrimestre para que las consultas generales vayan más rápido. |
| `sysacad_consultar` | Autogestión, solo lectura: exámenes aprobados y aplazados, plan, cursado, horarios, estado académico, correlatividades. |
| `sysacad_inscripcion_estado` | Dice si la inscripción a cursado está abierta. Solo mira. |
| `get_autogestion_avisos` | Avisos públicos de Autogestión (llamados, plazos, certificados). No requiere sesión. |
| `mail_list_messages`, `mail_read_message`, `mail_search` | Correo institucional: listar, leer y buscar por remitente, asunto, texto, fechas y no leídos, en una carpeta o en todas. No marcan nada como leído. |
| `mail_delete_messages`, `mail_restore_messages`, `mail_set_seen` | Mover a la Papelera, recuperar y marcar leído o no leído. Piden permiso en cada llamada. |

Donde se pide una materia sirve su nombre («ciencia de datos») en lugar del ID. Las fechas van en ISO 8601 con la zona del Campus (UTC-03:00).

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

## Claude Desktop sin terminal

Baja `utn-mcp-mendoza-<versión>.mcpb` de la Release (con su `.sha256`), ábrelo con doble clic (o en Ajustes → Extensiones) y completa las dos opciones opcionales. Después pide «Conectame con el Campus»: usa `session_status`, `install_browser` (primera vez, unos 150 MB) y `start_login`. Para renovar la sesión, pide lo mismo.

Para generar el paquete: `npm run build && npm run package:mcpb` (crea `release/`; requiere red). No está firmado: verifica su SHA-256.

## Resumen semanal

`utn-mcp-mendoza digest` imprime qué vence en los próximos 7 días (`--days=N`), lo vencido sin entregar y los avisos nuevos. `--notify` muestra una notificación del sistema (Linux con `notify-send`, macOS) y `--json` entrega los datos. `--schedule-help` explica cómo programarlo con cron o el Programador de tareas de Windows; no instala nada.

## Variables de entorno opcionales

| Variable | Efecto |
| --- | --- |
| `UTN_MCP_DEBUG=1` | Detalle técnico (sin URLs ni credenciales) cuando falla un comando. |
| `UTN_MCP_CACHE=1` | Guarda en disco los archivos descargados. **Desactivada** por defecto: deja material académico sin cifrar. |
| `UTN_MCP_CACHE_DIR` | Ruta absoluta de la caché (por defecto en la carpeta de sesión). Máximo 200 MiB; vence a los 14 días. |
| `UTN_MCP_EXTERNAL_ALLOW` | Hosts extra, separados por coma, que `read_external` y `study_pack` pueden leer. Por defecto solo GitHub, Gist y Colab en GitHub, sin cookies ni datos del Campus. |
| `UTN_MCP_DOWNLOAD_DIR` | Ruta absoluta de `download_file` (por defecto `~/Downloads/utn-mcp`). |
| `UTN_MCP_MIN_REQUEST_INTERVAL_MS` | Pausa mínima entre consultas al Campus (por defecto 1000). Con muchas materias, `get_deadlines` y `get_announcements` pueden devolver `partial: true`; pide las pendientes con `course_id`. |

## Qué está probado

- La instalación, el arranque MCP, la lista de herramientas, el registro de cada cliente, el almacenamiento seguro de una sesión de prueba y el inicio de Chromium pasan en CI para Windows, Linux y macOS. La CI no usa cuentas reales.
- Linux se probó a mano con una cuenta real: Campus, Autogestión y correo. Windows tiene validación previa; el almacenamiento de credenciales con DPAPI todavía no se probó en un Windows real. macOS necesita que estudiantes prueben con cuentas reales.
- `setup-codex` en cualquier sistema, y `setup-claude` y `setup-opencode` en Windows y macOS, no se probaron a mano.
- Los resultados dependen de los permisos de tu cuenta y de la disponibilidad del Campus.

## Si algo no funciona

**Ejecuta primero `utn-mcp-mendoza doctor`.** Muestra qué está bien y qué falta (Node.js, navegador, almacén seguro, sesión y clientes) y el comando que resuelve cada punto en rojo. No incluye rutas, usuarios ni datos del Campus, así que puedes pegarlo al reportar. `--offline` no consulta al Campus.

- **No se reconoce `node`, `npm`, `utn-mcp-mendoza` o el comando de tu cliente:** instala o reinstala el requisito y abre una terminal nueva.
- **La sesión venció:** `utn-mcp-mendoza login`. No hace falta reinstalar.
- **No abre el navegador, o dice que no existe tras actualizar:** `utn-mcp-mendoza install-browser` (cada versión necesita su Chromium). Si faltan bibliotecas en Linux, agrega `--with-deps` (pide `sudo`).
- **No se puede guardar la sesión:** desbloquea el Llavero de macOS, o usa una sesión gráfica Linux con Secret Service, y repite `login`.
- **Tu cliente no muestra `utn-mendoza`:** repite el `setup-*` de tu cliente, confirma con su `mcp list` y reinícialo. Si dice que ya existe, quítalo y repite.
- **No aparecen materias o actividades:** revisa `utn-mcp-mendoza status`; puede que no haya contenido visible para tu cuenta.

Para reportar, comparte el sistema operativo y su versión, `node --version`, el paso y el mensaje de error. No compartas contraseñas, cookies, archivos de sesión, capturas del Campus ni datos académicos. [Reportes en GitHub](https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues).

## Desinstalar

Ejecuta en este orden y quita solo el registro del cliente que usaste:

```text
utn-mcp-mendoza logout
utn-mcp-mendoza forget-credentials
codex mcp remove utn-mendoza
claude mcp remove utn-mendoza --scope user
opencode mcp remove utn-mendoza
npm uninstall --global utn-mcp-mendoza
```

Cierra la sesión local, borra las credenciales guardadas, quita el registro del cliente y desinstala el paquete. Más sobre seguridad en [SECURITY.md](SECURITY.md).

---

Proyecto independiente, sin afiliación institucional. Licencia MIT, ver [LICENSE](LICENSE).
