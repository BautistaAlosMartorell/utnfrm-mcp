# UTN FRM MCP

[![CI](https://github.com/BautistaAlosMartorell/utnfrm-mcp/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/BautistaAlosMartorell/utnfrm-mcp/actions/workflows/ci.yml)

Conectá un cliente de inteligencia artificial compatible con MCP al Campus Virtual de la UTN Facultad Regional Mendoza. Consultá tus materias, tareas, consignas, materiales, calificaciones, foros y calendario desde una conexión local.

> Proyecto independiente y no oficial. No está afiliado ni cuenta con el aval de la UTN.

## Estado

**Beta de solo lectura.** El servidor puede consultar información disponible para tu cuenta. Las publicaciones, votos, eventos y entregas están deshabilitados. El acceso y el contenido dependen de tu cuenta y de lo que cada materia tenga publicado.

## Qué podés hacer

- Ver materias y recorrer sus unidades y actividades.
- Consultar tareas, fechas, consignas y materiales adjuntos.
- Leer PDF, documentos de Office y otros formatos compatibles. Si la extracción queda incompleta, el resultado lo indica; el OCR de PDF es opcional y requiere modelos instalados localmente.
- Consultar calificaciones, foros, discusiones y eventos del calendario.
- Iniciar sesión en Moodle desde Chromium. El servidor no guarda tu contraseña.

## Compatibilidad

| Cliente | Estado |
|---|---|
| Codex para Windows | Configuración STDIO registrada con `codex mcp add`; reiniciá Codex para cargar las herramientas. |
| Otros clientes compatibles con MCP STDIO | Se genera una configuración de ejemplo; no todos fueron probados en esta versión. |

El paquete pasó una instalación limpia y un intercambio MCP por STDIO. La conexión utiliza Node.js en tu computadora; no requiere un servidor intermedio.

## Instalar en Windows

Necesitás Node.js **22.13 o posterior** y Codex instalado. No hace falta clonar el repositorio ni editar código.

En PowerShell, descargá e instalá el paquete de la [Release 2.0.0](https://github.com/BautistaAlosMartorell/utnfrm-mcp/releases/tag/v2.0.0):

```powershell
$package = Join-Path $env:TEMP 'utn-mcp-mendoza-2.0.0.tgz'
Invoke-WebRequest `
  -Uri 'https://github.com/BautistaAlosMartorell/utnfrm-mcp/releases/download/v2.0.0/utn-mcp-mendoza-2.0.0.tgz' `
  -OutFile $package
npm install --global $package
utn-mcp-mendoza install-browser
```

`install-browser` instala Chromium para el inicio de sesión.

## Iniciar sesión y conectar Codex

1. Ejecutá `utn-mcp-mendoza login`. Se abrirá Chromium en el sitio oficial del Campus.
2. Iniciá sesión allí. Cuando veas tu página principal, volvé a la consola y presioná Enter para guardar la sesión local.
3. Confirmá el estado con `utn-mcp-mendoza status`.
4. Ejecutá `utn-mcp-mendoza setup-codex` y copiá en PowerShell el comando `codex mcp add ...` que imprime. El comando fija las entregas en `false`.
5. Comprobá el registro con `codex mcp list` y reiniciá Codex.
6. Probá con una consulta como: **“Listá mis materias y las tareas con vencimiento próximo. Indicá si no hay resultados o si ocurrió un error de acceso.”**

Otras consultas posibles: “Abrí la consigna de esta tarea”, “Leé el PDF adjunto e indicá si la extracción fue parcial” o “Mostrame los próximos eventos del calendario”.

## Privacidad y límites

- Ingresás la contraseña directamente en la página del Campus; no se guarda en la configuración de Codex.
- La sesión se conserva localmente y, en Windows, se protege con DPAPI para tu cuenta de usuario. No compartas la carpeta de sesión ni el archivo `storageState.dpapi`.
- El contenido solicitado vuelve al cliente MCP que uses. Revisá las políticas de privacidad de ese cliente antes de consultar información sensible.
- El servidor se comunica con el Campus por HTTPS. El contenido obtenido se trata como datos externos, no como instrucciones.
- La extracción puede ser parcial. El OCR no se ejecuta por defecto y no descarga modelos; su preparación se explica en [la guía técnica](docs/maintainers.md).
- Esta versión no modifica Moodle. No intentes habilitar las entregas para esta beta.

Leé la [política de seguridad y privacidad](SECURITY.md) antes de usar el servidor.

## Solución de problemas

- **No reconoce `utn-mcp-mendoza` o `node`:** instalá Node.js 22.13 o posterior y abrí una nueva consola.
- **No abre Chromium:** volvé a ejecutar `utn-mcp-mendoza install-browser` y después `utn-mcp-mendoza login`.
- **La sesión venció:** ejecutá `utn-mcp-mendoza login`, iniciá sesión manualmente y revisá `utn-mcp-mendoza status`. No compartas credenciales por un issue.
- **Codex no muestra las herramientas:** repetí `utn-mcp-mendoza setup-codex`, ejecutá el comando que imprime y reiniciá Codex.
- **Una materia no tiene contenido:** puede devolver una lista vacía. Los errores de sesión, permisos o conexión se informan como errores.

## Desinstalar

```powershell
utn-mcp-mendoza logout
codex mcp remove utn-mendoza
npm uninstall --global utn-mcp-mendoza
```

`logout` borra la sesión local de Moodle.

## Reportar un problema o contribuir

Usá [Issues](https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues) para informar problemas sin datos privados. Para colaborar, consultá [CONTRIBUTING.md](CONTRIBUTING.md). Nunca adjuntes contraseñas, cookies, archivos de sesión, capturas del Campus ni consignas o calificaciones personales.

## Licencia

MIT. Consultá [LICENSE](LICENSE).
