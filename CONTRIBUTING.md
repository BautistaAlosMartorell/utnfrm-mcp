# Contribuir

Los cambios deben conservar el servidor MCP local por STDIO, el acceso de solo lectura por defecto y la validación estricta de los destinos de red.

## Antes de enviar un cambio

1. Instalá Node.js 22.13 o posterior y ejecutá `npm ci`.
2. Ejecutá `npm run verify`, `npm run package:check` y `npm run build`.
3. No uses una cuenta real para probar escrituras. Las pruebas de Campus deben ser de solo lectura, acotadas y sin reintentos agresivos.
4. No incluyas `.session`, archivos de estado del navegador, credenciales, modelos OCR, resultados privados ni salidas con contenido académico.

Describí el comportamiento observado, el esperado y el entorno. Para errores de extracción, indicá formato y si el resultado fue marcado como parcial, sin adjuntar documentos del Campus.
