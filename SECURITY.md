# Seguridad y privacidad

UTN FRM MCP es un proyecto independiente y no oficial. La beta actual es de solo lectura; no habilites funciones de escritura ni compartas archivos de sesión.

## Datos locales

- El inicio de sesión del Campus se hace en el navegador de Moodle. Si en el asistente (`setup-wizard`) elegís guardar tu usuario y contraseña UTN (opcional; hacen falta para Autogestión y el correo), quedan cifradas con el almacén seguro del sistema (DPAPI en Windows, Secret Service o Keychain en el resto), nunca en archivos de texto ni en la configuración MCP. Se eliminan con `utn-mcp-mendoza forget-credentials`.
- La sesión se conserva en el equipo del usuario; en Windows queda protegida con DPAPI para esa cuenta. No la adjuntes a un issue, no la sincronices públicamente y no la compartas.
- La caché de archivos (`UTN_MCP_CACHE=1`) está desactivada por defecto. Si la activás, los archivos quedan sin cifrar en tu equipo (carpeta con permisos solo para tu usuario); borrala cuando termines. `download_file` solo escribe en su carpeta de descargas y nunca sobrescribe archivos existentes.
- `start_login` abre una ventana del navegador en el Campus e `install_browser` descarga el navegador que usa el MCP (unos 150 MiB, de la fuente oficial de Playwright); ninguna de las dos lee tu contraseña ni hace nada en el Campus.
- `read_external` solo contacta sitios de una lista permitida (GitHub, Gist y Colab alojado en GitHub por defecto; más con `UTN_MCP_EXTERNAL_ALLOW`), solo por https, sin cookies ni datos del Campus, con tope de tamaño y sin seguir redirecciones a sitios no permitidos.
- `set_active_courses` guarda tu lista de materias en un archivo local (`profile.json`, permisos restringidos), sin credenciales ni contenido del Campus.
- El paquete `.mcpb` no está firmado: verificá su SHA-256 contra el publicado en la Release antes de instalarlo.
- Las consultas y el contenido que devuelve el Campus pasan al cliente MCP configurado. Aplican también las políticas de privacidad de ese cliente.
- No envíes credenciales, cookies, archivos `storageState`, capturas, consignas ni datos de calificaciones al reportar un problema.

## Reportar una vulnerabilidad

Informá vulnerabilidades de forma privada mediante la opción **Report a vulnerability** de la pestaña Security de este repositorio. Incluí los pasos mínimos para reproducirla y evitá datos reales del Campus. No publiques detalles explotables en un issue.

La beta no está aprobada para escrituras en Moodle. No pruebes envíos, publicaciones, votos ni cambios sobre cuentas reales.
