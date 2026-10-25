# UTN FRM MCP

Servidor MCP local para consultar materias, tareas, consignas, documentos, calificaciones, foros y calendario del Campus Virtual de la UTN Facultad Regional Mendoza desde Codex, Claude Code u OpenCode. Es un proyecto independiente, no oficial y sin afiliación institucional.

## Estado

**Beta de solo lectura.** Todas las escrituras en Moodle, incluidas entregas, publicaciones, votos y eventos, están deshabilitadas. El acceso y el contenido dependen de los permisos de cada cuenta y de lo publicado en cada materia.

## Compatibilidad

El servidor usa Node.js 22.13 o posterior y MCP por STDIO. La CI pasó en Windows, Linux y macOS con Node.js 22.13 y 24: instalación limpia del paquete, intercambio MCP, registro de Codex, almacenamiento seguro nativo y arranque de Chromium.

Windows cuenta con validación previa. Linux y macOS pasaron las verificaciones automatizadas, pero todavía necesitan una prueba manual con cuentas reales de Moodle. Esta beta invita a estudiantes a realizar esa prueba de solo lectura. La Release anterior `v2.0.0` permanece sin cambios.

## Instalación para Codex (sin clonar ni compilar)


### 1. Instala los requisitos

Necesitas **Node.js 22.13 o posterior** y **Codex CLI**. Si falta Node.js, instálalo desde [nodejs.org](https://nodejs.org/) y abre una terminal nueva. Si falta Codex CLI, sigue la [guía oficial de instalación de Codex](https://help.openai.com/en/articles/11096431). El comando es:

```sh
npm install --global @openai/codex
codex --version
```

Si ya tienes Codex CLI y `codex --version` funciona, continúa al paso siguiente.

### 2. Descarga los archivos de la beta

Abre la [Release `v2.1.0-beta.1`](https://github.com/BautistaAlosMartorell/utnfrm-mcp/releases/tag/v2.1.0-beta.1) y descarga estos tres archivos desde **Assets**:

- `utn-mcp-mendoza-2.1.0-beta.1.tgz` (instalador)
- `INICIO-RAPIDO.txt` (guía breve)
- `utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256` (checksum para verificar el instalador)

No descargues “Source code” ni clones el repositorio. Guarda los tres archivos en la misma carpeta y abre una terminal allí.

### 3. Instala el MCP

#### Windows (PowerShell)

```powershell
npm install --global .\utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

#### Linux (Ubuntu/Debian)

La sesión local se protege con Secret Service (GNOME Keyring o KWallet compatible). Instala los componentes del sistema y mantén activa la sesión gráfica y el almacén desbloqueado:

```bash
sudo apt-get update
sudo apt-get install -y libsecret-tools gnome-keyring
npm install --global ./utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

En otras distribuciones, instala el equivalente a `libsecret-tools` y un proveedor Secret Service. Usa una sesión gráfica normal y deja desbloqueado el almacén. Un entorno headless, SSH o WSL sin Secret Service no permite guardar la sesión con seguridad.

#### macOS

La sesión local se protege con el Llavero de inicio de sesión de macOS:

```bash
npm install --global ./utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

En el primer guardado, acepta el acceso al Llavero si macOS lo solicita.

### 4. Inicia sesión y conecta Codex

1. Ejecuta `utn-mcp-mendoza login`. Se abre Chromium visible en el Campus oficial.
2. Inicia sesión directamente en esa ventana. Cuando veas tu página principal, vuelve a la terminal y pulsa Enter.
3. Confirma que la sesión funciona con `utn-mcp-mendoza status`.
4. Registra el MCP en tu cliente. Claude Code y OpenCode lo hacen solos; Codex imprime el comando para que lo copies y lo ejecutes en la misma terminal. El registro fija las entregas en `false`.

   | Cliente | Comando | Comprueba |
   | --- | --- | --- |
   | Codex | `utn-mcp-mendoza setup-codex` | `codex mcp list` |
   | Claude Code | `utn-mcp-mendoza setup-claude` | `claude mcp list` |
   | OpenCode | `utn-mcp-mendoza setup-opencode` | `opencode mcp list` |

   Claude Code lo registra con alcance `user` (todos tus proyectos) y OpenCode en su configuración global. Con `--print` (por ejemplo `setup-claude --print`) solo se muestra el comando, sin ejecutarlo. Si el servidor ya estaba registrado, el cliente avisa: bórralo antes con los comandos de la sección Desinstalar.
5. Reinicia el cliente.
6. En el cliente, prueba: **Lista mis materias y las tareas próximas; distingue una lista vacía de un error de acceso.**

La contraseña se introduce solamente en la ventana oficial del Campus; no la guarda el MCP. Si la sesión vence, ejecuta `utn-mcp-mendoza login` para renovarla.

## Sesiones y privacidad

- La contraseña se introduce solamente en la página oficial del Campus y nunca se guarda.
- Windows protege la sesión con DPAPI. macOS y Linux cifran el archivo local y guardan su clave en el Llavero o Secret Service del sistema. Si el almacén seguro no está disponible, el MCP falla sin guardar una copia en texto plano.
- El directorio de sesión local es privado. No compartas sus archivos ni los adjuntes a un issue.
- El contenido solicitado se devuelve al cliente MCP que uses. Revisa la privacidad de ese cliente antes de consultar información sensible.
- El MCP envía las solicitudes al Campus por HTTPS y trata el contenido recuperado como datos externos, no como instrucciones.

## Verificacion

La CI prueba los tres sistemas operativos sin usar cuentas Moodle: instalación limpia temporal, arranque STDIO, inicialización y listado de herramientas MCP, comando de registro Codex, almacenamiento nativo de una sesión sintética y lanzamiento de Chromium. **Linux y macOS aún requieren validación manual con cuentas reales** para confirmar inicio de sesión y lectura de contenido en equipos de estudiantes. No se ejecutan escrituras en Moodle.

## Solucion de problemas

- **No abre Chromium:** ejecuta otra vez `utn-mcp-mendoza install-browser`. En Linux puede pedir permisos para instalar bibliotecas del sistema.
- **El almacén seguro no está disponible:** desbloquea el Llavero de macOS o inicia una sesión de escritorio Linux con Secret Service activo; vuelve a ejecutar `login`.
- **El cliente no muestra las herramientas:** repite `setup-codex`, `setup-claude` o `setup-opencode`, confirma con `codex|claude|opencode mcp list` y reinicia el cliente.
- **No aparecen materias o actividades:** una respuesta vacía puede indicar que no hay contenido visible. Si el servidor informa un error de acceso, revisa la sesión con `status` y vuelve a iniciar sesión si venció.

## Qué probar y cómo reportar un problema

Prueba inicio de sesión, `status`, conexión con Codex y consultas de materias, tareas, consignas, documentos, calificaciones y calendario. No intentes publicar, votar ni entregar. Si algo falla, envía a quien te compartió el paquete tu sistema operativo y versión, versión de Node (`node --version`), paso realizado y mensaje de error. No envíes contraseñas, archivos de sesión, cookies, capturas del Campus ni datos académicos privados.

## Desinstalar

```text
utn-mcp-mendoza logout
codex mcp remove utn-mendoza      # si lo registraste en Codex
claude mcp remove utn-mendoza -s user   # si lo registraste en Claude Code
opencode mcp remove utn-mendoza   # si lo registraste en OpenCode
npm uninstall --global utn-mcp-mendoza
```

`logout` elimina los archivos locales de sesión y su clave del almacén del sistema.

## Seguridad y problemas

Lee [SECURITY.md](SECURITY.md) antes de usarlo. Informa problemas en [GitHub Issues](https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues) sin adjuntar credenciales, cookies, sesiones, capturas del Campus ni información académica privada.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
