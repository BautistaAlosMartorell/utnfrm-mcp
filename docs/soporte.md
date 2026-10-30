# Soporte

## Qué está probado

- **CI** (Windows, Linux y macOS, sin cuentas reales): instalación, arranque MCP, lista de herramientas, registro de cada cliente, almacenamiento seguro de una sesión de prueba e inicio de Chromium.
- **A mano, con una cuenta real, solo en Linux (Debian):** Campus, Autogestión y correo, con credenciales guardadas (renovación automática, IMAP) y solo con cookies (`login` de tres pestañas, Webmail).
- **Sin probar:** adjuntos del Webmail (solo mensajes de ejemplo), duración de su sesión, DPAPI en un Windows real, cualquier cuenta real en macOS, Fedora (`dnf`) y Arch (`pacman`) —sus paquetes salen de sus repositorios—, `doas`, `pkexec`, `setup-codex` en cualquier sistema y `setup-claude`/`setup-opencode` en Windows y macOS.
- Los resultados dependen de los permisos de tu cuenta y de la disponibilidad del Campus.

## Si algo no funciona

**Ejecuta primero `utn-mcp-mendoza doctor`:** muestra qué está bien y qué falta (Node.js, navegador, almacén seguro, Campus, Autogestión, correo y clientes) con el comando que resuelve cada punto en rojo. No incluye rutas, usuarios ni datos del Campus, así que puedes pegarlo al reportar. `--offline` no consulta a los sitios.

- **No se reconoce `node`, `npm`, `utn-mcp-mendoza` o el comando de tu cliente:** instala o reinstala el requisito y abre una terminal nueva.
- **La sesión venció:** `utn-mcp-mendoza login`; no hace falta reinstalar. Con credenciales guardadas el Campus se renueva solo; si aun así falla, `doctor` dice qué sitio rechazó el acceso.
- **No abre el navegador, o dice que no existe tras actualizar:** `utn-mcp-mendoza install-browser` (cada versión necesita su Chromium). En Linux, si faltan bibliotecas: `utn-mcp-mendoza install-deps`.
- **No se puede guardar la sesión:** desbloquea el Llavero de macOS, o usa una sesión gráfica Linux con Secret Service, y repite `login`.
- **Tu cliente no muestra `utn-mendoza`:** repite su `setup-*`, confirma con su `mcp list` y reinícialo. Si dice que ya existe, quítalo y repite.
- **No aparecen materias o actividades:** revisa `utn-mcp-mendoza status`; puede que no haya contenido visible para tu cuenta.

Para reportar, comparte el sistema operativo y su versión, `node --version`, el paso y el mensaje de error; nunca contraseñas, cookies, archivos de sesión, capturas del Campus ni datos académicos. [Reportes en GitHub](https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues). Vulnerabilidades: ver [SECURITY.md](../SECURITY.md).

## Desinstalar

En este orden, quitando solo el registro del cliente que usaste:

```text
utn-mcp-mendoza logout
utn-mcp-mendoza forget-credentials
codex mcp remove utn-mendoza
claude mcp remove utn-mendoza --scope user
opencode mcp remove utn-mendoza
npm uninstall --global utn-mcp-mendoza
```
