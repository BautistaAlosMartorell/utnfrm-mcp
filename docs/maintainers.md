# Notas de mantenimiento

La instalación para estudiantes se documenta en el README. Esta página conserva solo notas necesarias para mantener el paquete.

## Verificación y paquete

```powershell
npm ci
npm run verify
npm run package:check
npm run build
npm audit --omit=dev
```

`package:check` genera e instala el paquete en un directorio temporal y comprueba el inicio MCP por STDIO y las herramientas registradas. No requiere una sesión Moodle.

## OCR opcional

El OCR no se ejecuta por defecto ni descarga modelos. Para una verificación local, configura `UTN_MCP_TESSDATA_DIR` con modelos Tesseract obtenidos de una fuente confiable. No incluyas modelos en Git ni en el paquete npm. Una extracción incompleta debe seguir indicada como parcial.

## Publicación

Mantener la versión del paquete y la etiqueta Git alineadas. Adjuntar a la Release el `.tgz` generado por `npm pack`, calcular SHA-256 del archivo final y comprobar que la instalación limpia y el handshake MCP funcionan con ese mismo archivo. No publicar hasta que una revisión del historial y del paquete confirme que no contienen credenciales, sesiones, datos personales ni material académico privado.

## Continuar desde el historial público saneado

El `main` histórico que quedó en el checkout original es solo una copia local. Para desarrollar una versión nueva, trabajá desde un clon del repositorio publicado:

```powershell
git clone https://github.com/BautistaAlosMartorell/utnfrm-mcp.git
cd utnfrm-mcp
git config user.name "UTN FRM MCP Maintainers"
git config user.email "noreply@github.com"
git switch -c feature/mi-cambio origin/main
```

Publicá ramas de trabajo y abrí un pull request hacia `main`. Para una release, actualizá la versión del paquete, repetí las verificaciones de esta guía y creá el tag y la Release desde el `main` saneado. Subí solo la rama de trabajo y el tag intencional; nunca mezcles el antiguo `main` local ni uses `git push --all`, `git push --mirror` o `git push --tags`. Si necesitás recuperar un cambio antiguo, revisá y aplicá su contenido manualmente, sin importar sus commits.
