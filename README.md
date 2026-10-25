# UTN FRM MCP — guía para estudiantes

> Beta multiplataforma de **solo lectura** para consultar el Campus Virtual de UTN Facultad Regional Mendoza desde Codex.

> **No puede entregar tareas, publicar en foros, votar ni agregar eventos.** Todas las escrituras en Moodle están deshabilitadas. Es un proyecto independiente y no oficial.

Esta guía sirve aunque nunca hayas instalado un MCP. No necesitas clonar el repositorio ni compilar el programa.

Si prefieres una hoja breve para seguir mientras instalas, abre [Inicio rápido](INICIO-RAPIDO.txt).

## Antes de empezar

Necesitas:

1. Una computadora con **Windows, Linux o macOS**.
2. **Node.js 22.13 o posterior**. Descárgalo de [nodejs.org](https://nodejs.org/), instálalo y abre una terminal nueva.
3. **Codex CLI**. Si todavía no lo tienes, sigue la [guía oficial de Codex](https://help.openai.com/en/articles/11096431). Con Node.js instalado, también puedes instalarlo desde una terminal:

   ```sh
   npm install --global @openai/codex
   ```

   Para comprobar ambos requisitos, ejecuta `node --version` y `codex --version`. Si algún comando dice que no se reconoce, cierra y vuelve a abrir la terminal después de instalar el programa correspondiente.

## 1. Descarga la beta

Abre la [Release v2.1.0-beta.1](https://github.com/BautistaAlosMartorell/utnfrm-mcp/releases/tag/v2.1.0-beta.1). En la sección **Assets**, descarga:

- `utn-mcp-mendoza-2.1.0-beta.1.tgz` — el instalador.
- `INICIO-RAPIDO.txt` — una copia breve de estos pasos.
- `utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256` — sirve para comprobar que el instalador se descargó correctamente.

Guarda los tres archivos juntos en una carpeta llamada `utn-mcp-beta` dentro de **Descargas**. No elijas los enlaces **Source code**: no los necesitas.

### Comprobar el instalador (recomendado)

Abre una terminal en la carpeta `utn-mcp-beta` y ejecuta el comando de tu sistema. El resultado debe indicar que la comprobación fue correcta (`OK`).

**Windows — PowerShell**

```powershell
$esperado = (Get-Content .\utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256 -Raw).Trim().Split()[0]
$obtenido = (Get-FileHash .\utn-mcp-mendoza-2.1.0-beta.1.tgz -Algorithm SHA256).Hash.ToLower()
if ($obtenido -eq $esperado) { "OK: instalador verificado" } else { "ERROR: vuelve a descargarlo" }
```

**Linux**

```bash
sha256sum -c utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256
```

**macOS**

```bash
shasum -a 256 -c utn-mcp-mendoza-2.1.0-beta.1.tgz.sha256
```

Si aparece `ERROR` o falla la comprobación, no instales ese archivo: vuelve a descargar los tres Assets.

## 2. Abre una terminal en esa carpeta

Usa una carpeta llamada `utn-mcp-beta` dentro de Descargas, como se indica arriba. Abre PowerShell en Windows o Terminal en Linux/macOS y ejecuta:

**Windows — PowerShell**

```powershell
cd "$HOME\Downloads\utn-mcp-beta"
```

**Linux y macOS**

```bash
cd ~/Downloads/utn-mcp-beta
```

Deja esa terminal abierta para los pasos siguientes. Si dice que la carpeta no existe, revisa que hayas guardado allí los tres archivos.

## 3. Instala el MCP y Chromium

Copia y ejecuta solamente el bloque correspondiente a tu sistema. El segundo comando instala el navegador que el MCP necesita para abrir el Campus.

**Windows — PowerShell**

```powershell
npm install --global .\utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

**Linux — Ubuntu o Debian**

El servidor necesita que el almacén seguro de contraseñas de tu sesión gráfica esté disponible. Ejecuta:

```bash
sudo apt-get update
sudo apt-get install -y libsecret-tools gnome-keyring
npm install --global ./utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

Usa una sesión de escritorio normal y mantén desbloqueado el almacén de contraseñas. En otras distribuciones de Linux puede ser necesario instalar el equivalente de esos paquetes. No funcionará de forma segura en una sesión sin Secret Service disponible, como algunos entornos SSH, headless o WSL.

**macOS**

```bash
npm install --global ./utn-mcp-mendoza-2.1.0-beta.1.tgz
utn-mcp-mendoza install-browser
```

Cuando macOS pregunte, permite que UTN FRM MCP use el Llavero de inicio de sesión.

## 4. Inicia sesión en el Campus

En la misma terminal:

1. Ejecuta `utn-mcp-mendoza login`.
2. Se abrirá una ventana del navegador en el Campus. Escribe tu usuario y contraseña **solo allí**, como cuando entras normalmente al Campus.
3. Cuando veas tu página de inicio del Campus, vuelve a la terminal y pulsa **Enter**.
4. Comprueba el acceso ejecutando `utn-mcp-mendoza status`.

El MCP no guarda tu contraseña. La sesión se conserva en el almacenamiento seguro del sistema. Si más adelante vence, vuelve a ejecutar `utn-mcp-mendoza login` y repite estos pasos; no hace falta reinstalar.

## 5. Conecta el servidor a Codex

En la misma terminal:

1. Ejecuta `utn-mcp-mendoza setup-codex`.
2. La pantalla mostrará un comando que empieza con `codex mcp add`. **Cópialo completo y ejecútalo** en la terminal. Ese comando registra el MCP en Codex y mantiene deshabilitadas las entregas.
3. Ejecuta `codex mcp list` y comprueba que aparezca `utn-mendoza`.
4. Cierra y vuelve a abrir Codex para que cargue las herramientas.

Esto es conectar un servidor MCP: Codex podrá pedirle datos del Campus cuando se lo solicites. El servidor corre localmente en tu computadora.

## 6. Prueba una consulta

En Codex, prueba con una petición como:

> Lista mis materias y las tareas próximas. Si no hay resultados, dime que la lista está vacía; si hubo un error de acceso, explícame cuál.

También puedes pedir consultar consignas, documentos, calificaciones, foros y calendario. Solo aparecerá el contenido que tu cuenta pueda ver. Una lista vacía puede significar que no hay contenido disponible; un mensaje de error significa que la consulta no pudo completarse.

## Qué está probado y qué falta

- La instalación del paquete, el arranque MCP, la lista de herramientas, el registro generado para Codex, el almacenamiento seguro de una sesión de prueba y el inicio de Chromium pasan en CI para Windows, Linux y macOS.
- Windows cuenta con validación previa. Linux y macOS todavía necesitan que estudiantes prueben el inicio de sesión y las consultas con cuentas reales. Esta beta sirve para esa validación.
- La CI no usa cuentas del Campus. Los resultados dependen de los permisos de tu cuenta, el contenido de tus materias y la disponibilidad del Campus.
- **No hagas entregas ni publiques desde esta beta.** Las escrituras en Moodle están deshabilitadas.

## Si algo no funciona

- **No se reconoce `node`, `npm`, `codex` o `utn-mcp-mendoza`:** instala o reinstala el requisito y abre una terminal nueva. Comprueba Node.js con `node --version`.
- **No abre el navegador:** ejecuta `utn-mcp-mendoza install-browser` otra vez. En Linux puede pedir instalar dependencias del sistema.
- **No se puede guardar la sesión:** desbloquea el Llavero de macOS o usa una sesión gráfica Linux con Secret Service disponible; luego vuelve a ejecutar `utn-mcp-mendoza login`.
- **Codex no muestra UTN Mendoza:** ejecuta `utn-mcp-mendoza setup-codex`, vuelve a correr el comando `codex mcp add ...` que imprime, confirma con `codex mcp list` y reinicia Codex.
- **La sesión venció:** ejecuta `utn-mcp-mendoza login` otra vez.
- **No aparecen materias o actividades:** comprueba primero `utn-mcp-mendoza status`. Puede que no haya contenido visible para tu cuenta o que la consulta haya informado un error.

Para reportar un problema, comparte el sistema operativo y su versión, el resultado de `node --version`, el paso que estabas haciendo y el mensaje de error. No compartas contraseñas, cookies, archivos de sesión, capturas del Campus ni datos académicos privados. Puedes abrir un [reporte en GitHub](https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues).

## Desinstalar

En una terminal ejecuta:

```text
utn-mcp-mendoza logout
codex mcp remove utn-mendoza
npm uninstall --global utn-mcp-mendoza
```

Esto cierra la sesión local, quita el registro de Codex y desinstala el paquete. Para más información sobre seguridad, consulta [SECURITY.md](SECURITY.md).

---

UTN FRM MCP es un proyecto independiente, sin afiliación institucional. Licencia MIT; consulta [LICENSE](LICENSE).

\n