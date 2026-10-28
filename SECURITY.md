# Seguridad y privacidad

UTN FRM MCP es un proyecto independiente y no oficial. La beta actual es de solo lectura en Moodle y Autogestión: no habilites funciones de escritura, no pruebes envíos, publicaciones ni votos sobre cuentas reales, y no compartas archivos de sesión.

## Credenciales y sesión

Hay dos modos (ver [docs/sesion.md](docs/sesion.md)):

- **Solo cookies:** el inicio de sesión del Campus, Autogestión y Webmail se hace en el navegador (`login`, tres pestañas). El MCP nunca ve la contraseña; guarda solo las cookies de los tres sitios, juntas y cifradas.
- **Credenciales guardadas (opcional, `setup-wizard`):** usuario, contraseña y correo quedan cifrados con el almacén seguro del sistema (DPAPI en Windows; Secret Service o Keychain en el resto), nunca en archivos de texto ni en la configuración MCP. Se eliminan con `utn-mcp-mendoza forget-credentials`. El MCP las usa para IMAP, para iniciar sesión en Autogestión y para renovar la sesión del Campus (navegador sin ventana, una sola vez por solicitud; no insiste si el Campus las rechaza ni evade desafíos de seguridad).

**Límite del modo con credenciales:** ninguna herramienta MCP las devuelve, pero cualquier programa que corra como tu usuario con el almacén desbloqueado (por ejemplo, la herramienta de shell de un agente) podría pedirlas, y ningún MCP puede impedirlo. Si eso importa, usa el modo cookies o agrega reglas de permisos `deny` en tu cliente para `secret-tool`, `utn-mcp-mendoza` y la carpeta de sesión.

La sesión se conserva en tu equipo (en Windows, protegida con DPAPI para esa cuenta). No la adjuntes a un issue, no la sincronices públicamente y no la compartas.

## Qué hace el MCP en cada sitio

- **Correo:** el Webmail se lee con `viewsource`, que no marca los mensajes como leídos. Las escrituras, por IMAP o Webmail, se limitan a mover a la Papelera, recuperar y marcar leído o no leído.
- `start_login` abre una ventana del navegador con los tres sitios e `install_browser` descarga el navegador del MCP (unos 150 MiB, de la fuente oficial de Playwright); ninguna lee tu contraseña ni hace nada en esos sitios.
- `read_external` solo contacta sitios de una lista permitida (GitHub, Gist y Colab alojado en GitHub; más con `UTN_MCP_EXTERNAL_ALLOW`), solo por https, sin cookies ni datos del Campus, con tope de tamaño y sin seguir redirecciones a sitios no permitidos.
- `download_file` solo escribe en su carpeta de descargas y nunca sobrescribe archivos existentes.
- `set_active_courses` guarda tu lista de materias en un archivo local (`profile.json`, permisos restringidos), sin credenciales ni contenido del Campus.

## Datos y privacidad

- La caché de archivos (`UTN_MCP_CACHE=1`) está desactivada por defecto. Si la activas, los archivos quedan sin cifrar en tu equipo (carpeta con permisos solo para tu usuario); bórrala cuando termines.
- Las consultas y el contenido que devuelven el Campus, Autogestión y el correo pasan al cliente MCP configurado; aplican también las políticas de privacidad de ese cliente.
- El paquete `.mcpb` no está firmado: verifica su SHA-256 contra el publicado en la Release antes de instalarlo.
- Al reportar un problema, no envíes credenciales, cookies, archivos `storageState`, capturas, consignas ni datos de calificaciones.

## Reportar una vulnerabilidad

Infórmala de forma privada con la opción **Report a vulnerability** de la pestaña Security de este repositorio. Incluye los pasos mínimos para reproducirla y evita datos reales del Campus. No publiques detalles explotables en un issue.
