# Instalación

Requisitos: Windows, Linux o macOS; **Node.js 22.13 o posterior** ([nodejs.org](https://nodejs.org/), abre una terminal nueva después de instalarlo); un cliente de IA con MCP (Codex, Claude Code u OpenCode). Comprueba con `node --version` y `codex --version`, `claude --version` u `opencode --version`.

## Solo Linux: almacén seguro

Hace falta `secret-tool` y un proveedor de Secret Service, en una sesión de escritorio normal y desbloqueada (no funciona de forma segura en SSH, headless o WSL):

| Distribución | Comando |
| --- | --- |
| Ubuntu / Debian (`apt`) | `sudo apt-get update && sudo apt-get install -y libsecret-tools gnome-keyring` |
| Fedora (`dnf`) | `sudo dnf install -y libsecret gnome-keyring` |
| Arch (`pacman`) | `sudo pacman -S --needed libsecret gnome-keyring` |

## Opción A: npm

```bash
npm install --global utn-mcp-mendoza@beta
utn-mcp-mendoza install-browser
```

Para actualizar, repite los mismos dos comandos (cada versión necesita su Chromium).

## Opción B: descarga verificada

De la [Release v2.1.1](https://github.com/BautistaAlosMartorell/utnfrm-mcp/releases/tag/v2.1.1) (sección **Assets**; no hacen falta los enlaces *Source code*) guarda en una carpeta `utn-mcp-beta` dentro de Descargas el instalador `utn-mcp-mendoza-2.1.1.tgz` y su `.sha256`. En esa carpeta, verifica (debe dar `OK`; si no, vuelve a descargar) e instala:

```powershell
# Windows — PowerShell
cd "$HOME\Downloads\utn-mcp-beta"
$esperado = (Get-Content .\utn-mcp-mendoza-2.1.1.tgz.sha256 -Raw).Trim().Split()[0]
$obtenido = (Get-FileHash .\utn-mcp-mendoza-2.1.1.tgz -Algorithm SHA256).Hash.ToLower()
if ($obtenido -eq $esperado) { "OK: instalador verificado" } else { "ERROR: vuelve a descargarlo" }
npm install --global .\utn-mcp-mendoza-2.1.1.tgz
utn-mcp-mendoza install-browser
```

```bash
# Linux
cd ~/Downloads/utn-mcp-beta
sha256sum -c utn-mcp-mendoza-2.1.1.tgz.sha256
npm install --global ./utn-mcp-mendoza-2.1.1.tgz
utn-mcp-mendoza install-browser

# macOS: igual, pero la verificación es  shasum -a 256 -c utn-mcp-mendoza-2.1.1.tgz.sha256
```

En macOS, cuando pregunte, permite que UTN FRM MCP use el Llavero de inicio de sesión.

## Bibliotecas de Chromium en Linux

Si Chromium no abre por falta de bibliotecas: `utn-mcp-mendoza install-deps`. Va por pasos: detecta el gestor de paquetes (`apt`, `dnf` o `pacman`) y la herramienta de permisos (`sudo`, `doas` o `pkexec`; como root no hace falta), muestra el comando exacto y pide confirmación (`--yes` la omite). Si un paso no se puede (por ejemplo `zypper`, `apk` o sin `sudo`/`doas`), lo dice y no ejecuta nada; en ese caso instala a mano `nss`, `nspr`, `atk`, `at-spi2`, `cups`, `libdrm`, `libxkbcommon`, `mesa`, `pango`, `cairo` y `alsa`. Con `apt` delega en Playwright, que elige los paquetes de cada versión de Ubuntu/Debian.

## Claude Desktop sin terminal

Baja `utn-mcp-mendoza-<versión>.mcpb` de la Release (con su `.sha256`; no está firmado, verifica el SHA-256), ábrelo con doble clic (o en Ajustes → Extensiones) y completa las dos opciones opcionales. Después pide «Conectame con el Campus» (usa `session_status`, `install_browser`, unos 150 MB la primera vez, y `start_login`); para renovar la sesión, pide lo mismo. Para generar el paquete: `npm run build && npm run package:mcpb` (crea `release/`; requiere red).

Siguiente paso: [Sesión y credenciales](sesion.md).
