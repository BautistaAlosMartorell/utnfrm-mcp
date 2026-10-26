# Seguridad y privacidad

UTN FRM MCP es un proyecto independiente y no oficial. La beta actual es de solo lectura; no habilites funciones de escritura ni compartas archivos de sesión.

## Datos locales

- La contraseña se ingresa en el navegador de Moodle y no se guarda en la configuración MCP.
- La sesión se conserva en el equipo del usuario; en Windows queda protegida con DPAPI para esa cuenta. No la adjuntes a un issue, no la sincronices públicamente y no la compartas.
- La caché de archivos (`UTN_MCP_CACHE=1`) está desactivada por defecto. Si la activás, los archivos quedan sin cifrar en tu equipo (carpeta con permisos solo para tu usuario); borrala cuando termines. `download_file` solo escribe en su carpeta de descargas y nunca sobrescribe archivos existentes.
- Las consultas y el contenido que devuelve el Campus pasan al cliente MCP configurado. Aplican también las políticas de privacidad de ese cliente.
- No envíes credenciales, cookies, archivos `storageState`, capturas, consignas ni datos de calificaciones al reportar un problema.

## Reportar una vulnerabilidad

Informá vulnerabilidades de forma privada mediante la opción **Report a vulnerability** de la pestaña Security de este repositorio. Incluí los pasos mínimos para reproducirla y evitá datos reales del Campus. No publiques detalles explotables en un issue.

La beta no está aprobada para escrituras en Moodle. No pruebes envíos, publicaciones, votos ni cambios sobre cuentas reales.
