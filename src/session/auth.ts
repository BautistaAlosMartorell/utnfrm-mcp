import { installChromium } from '../cli/install-browser.js';
import { browserInstalled } from './browser.js';
import { runBrowserLogin, type BrowserLoginResult } from './browser-login.js';

/**
 * Inicio de sesión desde la terminal. No pide pulsar Enter ni volver a la terminal: se abre el Campus,
 * la persona ingresa ahí y, apenas la página confirma que entró, la sesión se guarda y la ventana se cierra.
 * Si falta el navegador, se instala solo.
 */
export async function loginInteractive(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('   UTN MCP Mendoza — Inicio de Sesión en Campus FRM   ');
  console.log('======================================================\n');

  if (!browserInstalled()) {
    console.log('Falta el navegador que se usa para iniciar sesión. Lo instalo ahora (unos 150 MB; puede tardar un par de minutos)…\n');
    const status = installChromium();
    if (status !== 0 || !browserInstalled()) {
      console.error('\n[Error] No se pudo instalar el navegador. Probá: utn-mcp-mendoza install-browser (en Linux, si pide permisos: utn-mcp-mendoza install-browser --with-deps).');
      return false;
    }
    console.log('\n✔ Navegador instalado.\n');
  }

  console.log('Se va a abrir una ventana con la página de acceso del Campus.');
  console.log('1. Escribí tu usuario y contraseña ahí (este programa nunca los ve).');
  console.log('2. Eso es todo: la ventana se cierra sola cuando entrás. No hace falta volver a esta terminal.\n');

  const result = await runBrowserLogin({ onProgress: message => console.log(message) });
  if (!result.ok) {
    console.error(`\n[Error] ${result.message}`);
    return false;
  }
  console.log('\n[Éxito] Sesión guardada de forma segura en tu equipo. No la compartas ni la agregues a Git.');
  console.log('Ya podés usar el MCP desde tu cliente de IA.\n');
  return true;
}

/** Inicio de sesión desde el cliente de IA (herramienta start_login): igual que el anterior, sin consola. */
export async function loginInBackground(timeoutMs = 180000): Promise<BrowserLoginResult> {
  return runBrowserLogin({ timeoutMs });
}
