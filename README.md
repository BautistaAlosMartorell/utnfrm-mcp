# UTN FRM MCP — guía para estudiantes

> Beta multiplataforma de **solo lectura** para consultar el Campus Virtual de UTN Facultad Regional Mendoza desde Codex, Claude Code u OpenCode.

> **No puede entregar tareas, publicar en foros, votar ni agregar eventos.** Todas las escrituras en Moodle están deshabilitadas. Es un proyecto independiente y no oficial.

Esta guía sirve aunque nunca hayas instalado un MCP. No necesitas clonar el repositorio ni compilar el programa.

Si prefieres una hoja breve para seguir mientras instalas, abre [Inicio rápido](INICIO-RAPIDO.txt).

## Antes de empezar

Necesitas:

1. Una computadora con **Windows, Linux o macOS**.
2. **Node.js 22.13 o posterior**. Descárgalo de [nodejs.org](https://nodejs.org/), instálalo y abre una terminal nueva.
3. **Un cliente de IA con soporte MCP ya instalado**: Codex, Claude Code u OpenCode. Esta guía no cubre cómo instalarlos; sigue la documentación oficial de cada uno.

   Para comprobar los requisitos, ejecuta `node --version` y el comando de tu cliente (`codex --version`, `claude --version` u `opencode --version`). Si algún comando dice que no se reconoce, cierra y vuelve a abrir la terminal después de instalar el programa correspondiente.

## 1. Descarga la beta

Abre la [Release v2.1.0-beta.1](https://github.com/BautistaAlosMartorell/utnfrm-mcp/releases/tag/v2.1.0-beta.1). En la sección **Assets**, descarga:

- `utn-mcp-mendoza-2.1.0-beta.1.tgz` — el instalador.
- `INICIO-RAPIDO.txt` — una copia breve de estos pasos.
- `utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256` — sirve para comprobar que el instalador se descargó correctamente.

Guarda los tres archivos juntos en una carpeta llamada `utn-mcp-beta` dentro de **Descargas**. No elijas los enlaces **Source code**: no los necesitas.

### Comprobar el instalador (recomendado)

Abre una terminal en la carpeta `utn-mcp-beta` y ejecuta el comando de tu sistema. El resultado debe indicar que la comprobación fue correcta (`OK`).

**Windows — PowerShell**

```powershell
$esperado = (Get-Content .\utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256 -Raw).Trim().Split()[0]
$obtenido = (Get-FileHash .\utn-mcp-mendoza-2.1.0-beta.1.tgz -Algorithm SHA256).Hash.ToLower()
if ($obtenido -eq $esperado) { "OK: instalador verificado" } else { "ERROR: vuelve a descargarlo" }
```

**Linux**

```bash
sha256sum -c utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256
```

**macOS**

```bash
shasum -a 256 -c utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256
```

Si aparece `ERROR` o falla la comprobación, no instales ese archivo: vuelve a descargar los tres Assets.

## 2. Abre una terminal en esa carpeta

Usa una carpeta llamada `utn-mcp-beta` dentro de Descargas, como se indica arriba. Abre PowerShell en Windows o Terminal en Linux/macOS y ejecuta:

**Windows — PowerShell**

```powershell
cd "$HOME\Downloads\utn-mcp-beta"
```

**Linux y macOS**

```bash
cd ~/Downloads/utn-mcp-beta
```

Deja esa terminal abierta para los pasos siguientes. Si dice que la carpeta no existe, revisa que hayas guardado allí los tres archivos.

## 3. Instala el MCP y Chromium

Copia y ejecuta solamente el bloque correspondiente a tu sistema. El segundo comando instala el navegador que el MCP necesita para abrir el Campus.

**Windows — PowerShell**

```powershell
npm install --global .\utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

**Linux — Ubuntu o Debian**

El servidor necesita que el almacén seguro de contraseñas de tu sesión gráfica esté disponible. Ejecuta:

```bash
sudo apt-get update
sudo apt-get install -y libsecret-tools gnome-keyring
npm install --global ./utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

Usa una sesión de escritorio normal y mantén desbloqueado el almacén de contraseñas. En otras distribuciones de Linux puede ser necesario instalar el equivalente de esos paquetes. No funcionará de forma segura en una sesión sin Secret Service disponible, como algunos entornos SSH, headless o WSL.

**macOS**

```bash
npm install --global ./utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

Cuando macOS pregunte, permite que UTN FRM MCP use el Llavero de inicio de sesión.

> **Atajo: asistente guiado.** Una vez hecho el paso 3, ejecutá `utn-mcp-mendoza setup-wizard` y se encarga de lo que sigue: revisa tu equipo, instala el navegador si falta, te ofrece guardar tu usuario (DNI) y contraseña UTN de forma cifrada (opcional), abre el Campus para que inicies sesión, conecta los clientes de IA que encuentre en tu equipo y termina con una prueba real. Si algo requiere permisos de administrador, te muestra el comando exacto. Con `--yes` acepta las opciones por defecto, con `--no-login` omite el inicio de sesión y con `--no-register` no toca la configuración de tus clientes. Si preferís hacerlo a mano, seguí los pasos 4 y 5.

## 4. Inicia sesión en el Campus

En la misma terminal:

1. Ejecuta `utn-mcp-mendoza login`.
2. Se abrirá una ventana del navegador en el Campus (con un cartel que te lo recuerda). Escribe tu usuario y contraseña **solo allí**, como cuando entras normalmente al Campus.
3. Eso es todo: **no hace falta volver a la terminal ni pulsar nada**. Apenas el Campus confirma que entraste, la sesión se guarda y la ventana se cierra sola. Si falta el navegador, se instala solo la primera vez.
4. Comprueba el acceso ejecutando `utn-mcp-mendoza status`.

Por defecto el MCP no guarda tu contraseña: solo lo hace si la cargás en el asistente (opcional), cifrada con el almacén seguro del sistema; `utn-mcp-mendoza forget-credentials` la elimina. La sesión se conserva en el almacenamiento seguro del sistema. Si más adelante vence, vuelve a ejecutar `utn-mcp-mendoza login`; no hace falta reinstalar. (Con el MCP conectado también podés pedirle a tu cliente de IA «renová mi sesión del Campus»: usa `start_login`.)

## 5. Conecta el servidor a tu cliente

En la misma terminal, ejecuta el comando de tu cliente. Cada uno **registra el MCP por ti** y deja deshabilitadas las entregas:

| Cliente | Comando | Comprueba que aparezca `utn-mendoza` |
| --- | --- | --- |
| Codex | `utn-mcp-mendoza setup-codex` | `codex mcp list` |
| Claude Code | `utn-mcp-mendoza setup-claude` | `claude mcp list` |
| OpenCode | `utn-mcp-mendoza setup-opencode` | `opencode mcp list` |

Después, cierra y vuelve a abrir tu cliente para que cargue las herramientas.

- Claude Code lo registra con alcance `user`, así que queda disponible en todos tus proyectos. OpenCode lo registra en su configuración global.
- Si prefieres ver el comando antes de ejecutarlo, agrega `--print` (por ejemplo `utn-mcp-mendoza setup-claude --print`): solo lo muestra, sin ejecutarlo.
- Si el MCP ya estaba registrado, el cliente lo informa y no lo reemplaza. Quítalo antes con los comandos de la sección **Desinstalar**.
- Si el cliente no está instalado o no se encuentra en el `PATH`, el comando muestra la línea completa para que la ejecutes a mano.

Esto es conectar un servidor MCP: tu cliente podrá pedirle datos del Campus cuando se lo solicites. El servidor corre localmente en tu computadora.

## 6. Prueba una consulta

En tu cliente, prueba con una petición como:

> Lista mis materias y las tareas próximas. Si no hay resultados, dime que la lista está vacía; si hubo un error de acceso, explícame cuál.

También puedes pedir consultar consignas, documentos, calificaciones, foros y calendario. Solo aparecerá el contenido que tu cuenta pueda ver. Una lista vacía puede significar que no hay contenido disponible; un mensaje de error significa que la consulta no pudo completarse.

## Qué puede consultar

Además de las herramientas básicas (materias, tareas, archivos, notas, foros y calendario), la beta incluye:

| Herramienta | Para qué sirve |
| --- | --- |
| `get_course_contents` | Todas las unidades de una materia con sus actividades en una sola consulta; funciona también con el formato por mosaicos. |
| `get_deadlines` | Próximas entregas y cierres de cuestionarios, de una materia o de todas, ordenadas por fecha y con tu estado de entrega. |
| `get_announcements` | Avisos recientes del foro de novedades, con fecha y, si querés, el texto. |
| `get_quiz_info` | Reglas, nota e intentos de un cuestionario, o todos los de una materia. Nunca inicia ni envía un intento. |
| `download_file` | Guarda un archivo del Campus en una carpeta local (`~/Downloads/utn-mcp`) sin sobrescribir nada. |
| `read_file` con `full: true` | Devuelve el documento completo en una sola respuesta en vez de fragmentos. En los PDF las tablas se reconstruyen con sus columnas y celdas vacías. |
| `study_pack` | Junta todo el material de una unidad (archivos, carpetas, páginas y enlaces permitidos), con un índice de temas por página y el estado de lectura de cada fuente. Es la base de los resúmenes. |
| `get_pdf_page_image` | Dibuja una página de un PDF como imagen, para ver diagramas, gráficos y fórmulas que el texto no captura. |
| `read_external` | Lee notebooks y archivos públicos que la cátedra enlaza (GitHub, Gist, Colab alojado en GitHub). |
| `session_status`, `start_login`, `install_browser` | Permiten conectar el Campus **sin terminal**: ver el estado de la sesión, instalar el navegador y abrir la ventana de inicio de sesión desde tu cliente de IA. |
| `set_active_courses` | Guarda qué materias cursás este cuatrimestre para que las consultas generales (entregas, avisos) revisen solo esas y respondan mucho más rápido. |

En las herramientas que piden una materia podés usar su nombre ("ciencia de datos") en lugar del ID numérico. `list_courses` acepta `query` para filtrar por nombre. Las fechas se informan en formato ISO 8601 con la zona horaria del Campus (UTC-03:00).

## Atajos listos para usar

Tu cliente los muestra como acciones (según el cliente, con `/` o en el menú de prompts):

| Atajo | Qué hace |
| --- | --- |
| `conectar_con_el_campus` | Te guía para instalar el navegador e iniciar sesión, sin terminal. |
| `resumen_de_mi_semana` | Qué vence en 7 días y qué avisos nuevos hay. |
| `que_entrego` | Pendientes hasta una fecha o cantidad de días. |
| `resumir_unidad` | Resumen completo de una unidad, con índice de cobertura y páginas de origen. |
| `preparar_parcial` | Temas, chuleta, preguntas de práctica y plan de estudio. |
| `practica_de_unidad`, `tarjetas_de_repaso`, `plan_de_estudio` | Preguntas con respuestas, tarjetas y plan día por día. |

## Instalación sin terminal (Claude Desktop)

Si usás Claude Desktop no necesitás Node.js ni la terminal: bajá el archivo `utn-mcp-mendoza-<versión>.mcpb` de la Release (junto a su `.sha256`), abrilo con doble clic (o en Ajustes → Extensiones) y completá las dos opciones opcionales. Después pedile a Claude «Conectame con el Campus»: usa `session_status`, `install_browser` (la primera vez descarga el navegador, unos 150 MB) y `start_login` (se abre una ventana del Campus: tu contraseña la escribís solo ahí). Las sesiones vencen tras unas horas; para renovarla, pedile lo mismo.

Para generar el paquete: `npm run build && npm run package:mcpb` (crea `release/`; hace falta red para instalar las dependencias de producción). El paquete no está firmado: verificá su SHA-256 antes de instalarlo.

## Resumen semanal

`utn-mcp-mendoza digest` imprime qué vence en los próximos 7 días (`--days=N`), lo vencido sin entregar y los avisos nuevos. Con `--notify` muestra además una notificación del sistema (Linux con `notify-send`, macOS), y con `--json` entrega los datos. `utn-mcp-mendoza digest --schedule-help` explica cómo programarlo cada lunes con cron o el Programador de tareas de Windows; no se instala nada automáticamente.

## Variables de entorno opcionales

| Variable | Efecto |
| --- | --- |
| `UTN_MCP_DEBUG=1` | Muestra el detalle técnico (pila de llamadas, sin URLs ni credenciales) cuando un comando de la terminal falla. |
| `UTN_MCP_CACHE=1` | Guarda en disco los archivos descargados para no volver a bajarlos. Está **desactivada** por defecto porque deja material académico sin cifrar en tu equipo. |
| `UTN_MCP_CACHE_DIR` | Ruta absoluta de la caché (por defecto, dentro de la carpeta de sesión). Máximo 200 MiB; las entradas vencen a los 14 días. |
| `UTN_MCP_EXTERNAL_ALLOW` | Sitios extra (nombres de host separados por coma) que `read_external` y `study_pack` pueden leer cuando la cátedra los enlaza. Por defecto solo GitHub, Gist y Colab alojado en GitHub; se lee sin cookies ni datos del Campus. |
| `UTN_MCP_DOWNLOAD_DIR` | Ruta absoluta donde `download_file` guarda los archivos (por defecto `~/Downloads/utn-mcp`). |
| `UTN_MCP_MIN_REQUEST_INTERVAL_MS` | Pausa mínima entre consultas al Campus (por defecto 1000). Con muchas materias, `get_deadlines` y `get_announcements` pueden devolver `partial: true`; volvé a pedir las pendientes con `course_id`. |

## Qué está probado y qué falta

- La instalación del paquete, el arranque MCP, la lista de herramientas, el comando de registro de cada cliente (Codex, Claude Code y OpenCode), el almacenamiento seguro de una sesión de prueba y el inicio de Chromium pasan en CI para Windows, Linux y macOS.
- Windows cuenta con validación previa. Linux se probó a mano con una cuenta real: inicio de sesión, `status`, `whoami` y consultas de materias y calendario desde Claude Code y OpenCode. macOS todavía necesita que estudiantes prueben el inicio de sesión y las consultas con cuentas reales. Esta beta sirve para esa validación.
- El registro con `setup-codex` (en cualquier sistema) y los comandos `setup-claude` y `setup-opencode` en Windows y macOS todavía no se probaron a mano.
- La CI no usa cuentas del Campus. Los resultados dependen de los permisos de tu cuenta, el contenido de tus materias y la disponibilidad del Campus.
- **No hagas entregas ni publiques desde esta beta.** Las escrituras en Moodle están deshabilitadas.

## Si algo no funciona

**Primero ejecutá `utn-mcp-mendoza doctor`.** Muestra en una pantalla qué está bien y qué falta (Node.js, navegador, almacén seguro, sesión del Campus y clientes conectados) y, para cada punto en rojo, el comando que lo resuelve. La salida no incluye rutas, usuarios ni datos del Campus, así que podés pegarla tal cual al reportar un problema. Con `--offline` no consulta al Campus.

Las sesiones del Campus vencen tras unas horas: si `doctor` o tu cliente dicen que la sesión venció, ejecutá `utn-mcp-mendoza login` otra vez. No hace falta reinstalar nada.

- **No se reconoce `node`, `npm`, `utn-mcp-mendoza` o el comando de tu cliente (`codex`, `claude`, `opencode`):** instala o reinstala el requisito y abre una terminal nueva. Comprueba Node.js con `node --version`.
- **No abre el navegador:** ejecuta `utn-mcp-mendoza install-browser` otra vez. En Linux puede pedir instalar dependencias del sistema.
- **`install-browser` pide `sudo` en Linux:** el comando instala solo Chromium. Si además faltan bibliotecas del sistema, ejecutá `utn-mcp-mendoza install-browser --with-deps`.
- **El navegador "no existe" tras actualizar:** cada versión del MCP necesita su propio Chromium; ejecutá `utn-mcp-mendoza install-browser` otra vez.
- **No se puede guardar la sesión:** desbloquea el Llavero de macOS o usa una sesión gráfica Linux con Secret Service disponible; luego vuelve a ejecutar `utn-mcp-mendoza login`.
- **Tu cliente no muestra UTN Mendoza:** ejecuta otra vez `utn-mcp-mendoza setup-codex`, `setup-claude` o `setup-opencode`, confirma con `codex mcp list`, `claude mcp list` u `opencode mcp list` y reinicia el cliente. Si dice que ya existe, quítalo (sección **Desinstalar**) y repite.
- **La sesión venció:** ejecuta `utn-mcp-mendoza login` otra vez.
- **No aparecen materias o actividades:** comprueba primero `utn-mcp-mendoza status`. Puede que no haya contenido visible para tu cuenta o que la consulta haya informado un error.

Para reportar un problema, comparte el sistema operativo y su versión, el resultado de `node --version`, el paso que estabas haciendo y el mensaje de error. No compartas contraseñas, cookies, archivos de sesión, capturas del Campus ni datos académicos privados. Puedes abrir un [reporte en GitHub](https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues).

## Desinstalar

En una terminal ejecuta, en este orden, y quita solo el registro del cliente que hayas usado:

```text
utn-mcp-mendoza logout
codex mcp remove utn-mendoza
claude mcp remove utn-mendoza --scope user
opencode mcp remove utn-mendoza
npm uninstall --global utn-mcp-mendoza
```

Esto cierra la sesión local, quita el registro del cliente y desinstala el paquete. Para más información sobre seguridad, consulta [SECURITY.md](SECURITY.md).

---

UTN FRM MCP es un proyecto independiente, sin afiliación institucional. Licencia MIT; consulta [LICENSE](LICENSE).

\n