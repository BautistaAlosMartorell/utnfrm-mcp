# UTN FRM MCP

Servidor [MCP](https://modelcontextprotocol.io/) para consultar el Campus Virtual, Autogestión (Sysacad) y el correo institucional de UTN Facultad Regional Mendoza desde Codex, Claude Code u OpenCode. Proyecto independiente y no oficial, en beta.

## Qué hace

- **Campus (Moodle):** materias, tareas y fechas de entrega, archivos, notas, foros, calendario y avisos. Arma paquetes de estudio por unidad y lee PDF con tablas.
- **Autogestión:** exámenes, plan, cursado, horarios, estado académico, correlatividades y estado de la inscripción.
- **Correo:** listar, leer, buscar, mover a la Papelera y marcar leído, por IMAP o por Webmail.

**Solo lectura en Moodle y Autogestión:** no entrega tareas, no publica en foros, no se inscribe a nada. En el correo nunca envía ni borra definitivamente. Detalle en [SECURITY.md](SECURITY.md).

## Inicio rápido

Requisitos: Windows, Linux o macOS; **Node.js 22.13 o posterior**; un cliente de IA con MCP (Codex, Claude Code u OpenCode).

```bash
npm install --global utn-mcp-mendoza@beta
utn-mcp-mendoza install-browser
utn-mcp-mendoza setup-wizard
```

El asistente revisa el equipo, inicia sesión, conecta tu cliente y hace una prueba real. Luego pregúntale a tu cliente: *«Lista mis materias y las tareas próximas»*.

En Linux, instala antes el almacén seguro de contraseñas; ver [Instalación](docs/instalacion.md).

## Documentación

| Tema | Contenido |
| --- | --- |
| [Instalación](docs/instalacion.md) | npm o descarga verificada (SHA-256), dependencias de Linux, Claude Desktop (`.mcpb`). |
| [Sesión y credenciales](docs/sesion.md) | Login con cookies o con credenciales guardadas, comportamiento del correo. |
| [Uso](docs/uso.md) | Conectar tu cliente, herramientas y atajos. |
| [Referencia](docs/referencia.md) | Comandos, flags y variables de entorno. |
| [Soporte](docs/soporte.md) | Qué está probado, solución de problemas, desinstalar. |
| [Seguridad](SECURITY.md) | Datos locales, límites y cómo reportar una vulnerabilidad. |
| [Plan de mejoras](docs/roadmap.md) · [Contribuir](CONTRIBUTING.md) · [Mantenimiento](docs/maintainers.md) | |

Hay también una [hoja corta para estudiantes](INICIO-RAPIDO.txt).

## Licencia

MIT, ver [LICENSE](LICENSE). Sin afiliación institucional.
