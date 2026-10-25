# UTN FRM MCP

Servidor MCP local para consultar materias, tareas, consignas, documentos, calificaciones, foros y calendario del Campus Virtual de la UTN Facultad Regional Mendoza desde Codex. Es un proyecto independiente, no oficial y sin afiliación institucional.

## Estado

Beta de solo lectura. Las funciones de publicación, votos, eventos y entregas permanecen deshabilitadas. El acceso y el contenido dependen de los permisos de cada cuenta y de lo publicado en cada materia.

## Compatibilidad

El servidor usa Node.js 22.13 o posterior y MCP por STDIO. La rama actual incorpora soporte para Windows, Linux y macOS. CI ejecuta pruebas en los tres sistemas: instalación limpia del paquete, intercambio MCP, generación del comando de registro de Codex, almacenamiento seguro nativo y arranque de Chromium.

La Release pública `v2.0.0` fue validada en Windows. El soporte Linux/macOS de esta rama aún no forma parte de una Release; espera una versión publicada con estos cambios antes de instalarlo en esos sistemas.

## Instalar el paquete

Descarga el `.tgz` adjunto a la Release indicada para tu sistema y abre una terminal en la carpeta de descarga. Necesitas Node.js 22.13 o posterior y Codex.

### Windows (PowerShell)

```powershell
$package = Get-ChildItem .\utn-mcp-mendoza-*.tgz | Select-Object -First 1
npm install --global $package.FullName
utn-mcp-mendoza install-browser
```

### Linux (Ubuntu/Debian)

La sesión local se protege con Secret Service (GNOME Keyring o KWallet compatible). Instala los componentes del sistema y mantén activa la sesión gráfica y el almacén desbloqueado:

```bash
sudo apt-get update
sudo apt-get install -y libsecret-tools gnome-keyring
npm install --global ./utn-mcp-mendoza-*.tgz
utn-mcp-mendoza install-browser
```

En otras distribuciones, instala el equivalente a `libsecret-tools` y un proveedor Secret Service. Un entorno headless, SSH o WSL sin Secret Service no permite guardar la sesión con seguridad.

### macOS

La sesión local se protege con el Llavero de inicio de sesión de macOS:

```bash
npm install --global ./utn-mcp-mendoza-*.tgz
utn-mcp-mendoza install-browser
```

En el primer guardado, acepta el acceso al Llavero si macOS lo solicita.

## Iniciar sesion y conectar Codex

1. Ejecuta `utn-mcp-mendoza login`. Se abre Chromium visible en el Campus oficial.
2. Inicia sesión directamente en esa ventana. Cuando veas tu página principal, vuelve a la terminal y pulsa Enter.
3. Confirma que la sesión funciona con `utn-mcp-mendoza status`.
4. Ejecuta `utn-mcp-mendoza setup-codex`, copia el comando `codex mcp add ...` que muestra y ejecútalo en la misma terminal. El registro fija las entregas en `false`.
5. Comprueba el registro con `codex mcp list` y reinicia Codex.
6. En Codex, prueba: **Lista mis materias y las tareas próximas; distingue una lista vacía de un error de acceso.**

Si la sesión vence, vuelve a ejecutar `utn-mcp-mendoza login`; no hace falta guardar ni volver a escribir la contraseña en el MCP.

## Sesiones y privacidad

- La contraseña se introduce solamente en la página oficial del Campus y nunca se guarda.
- Windows protege la sesión con DPAPI. macOS y Linux cifran el archivo local y guardan su clave en el Llavero o Secret Service del sistema. Si el almacén seguro no está disponible, el MCP falla sin guardar una copia en texto plano.
- El directorio de sesión local es privado. No compartas sus archivos ni los adjuntes a un issue.
- El contenido solicitado se devuelve al cliente MCP que uses. Revisa la privacidad de ese cliente antes de consultar información sensible.
- El MCP envía las solicitudes al Campus por HTTPS y trata el contenido recuperado como datos externos, no como instrucciones.

## Verificacion

La CI prueba los tres sistemas operativos sin usar una cuenta Moodle: instalación limpia temporal, arranque STDIO, inicialización y listado de herramientas MCP, comando de registro Codex, almacenamiento nativo de una sesión sintética y lanzamiento de Chromium. La suite no sustituye un inicio de sesión real; el acceso al Campus y el contenido disponible deben validarse manualmente por cada estudiante. No se ejecutan escrituras en Moodle.

## Solucion de problemas

- **No abre Chromium:** ejecuta otra vez `utn-mcp-mendoza install-browser`. En Linux puede pedir permisos para instalar bibliotecas del sistema.
- **El almacén seguro no está disponible:** desbloquea el Llavero de macOS o inicia una sesión de escritorio Linux con Secret Service activo; vuelve a ejecutar `login`.
- **Codex no muestra las herramientas:** repite `setup-codex`, ejecuta el comando que imprime, confirma `codex mcp list` y reinicia Codex.
- **No aparecen materias o actividades:** una respuesta vacía puede indicar que no hay contenido visible. Si el servidor informa un error de acceso, revisa la sesión con `status` y vuelve a iniciar sesión si venció.

## Desinstalar

```text
utn-mcp-mendoza logout
codex mcp remove utn-mendoza
npm uninstall --global utn-mcp-mendoza
```

`logout` elimina los archivos locales de sesión y su clave del almacén del sistema.

## Seguridad y problemas

Lee [SECURITY.md](SECURITY.md) antes de usarlo. Informa problemas en [GitHub Issues](https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues) sin adjuntar credenciales, cookies, sesiones, capturas del Campus ni información académica privada.

## Licencia

MIT. Consulta [LICENSE](LICENSE).
