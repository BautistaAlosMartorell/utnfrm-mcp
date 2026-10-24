import { chromium } from 'playwright';
import readline from 'node:readline/promises';
import { CAMPUS_ORIGIN, PATHS } from '../config.js';
import { SessionStore } from './session-store.js';
import { sanitizeCampusErrorMessage } from '../client/error-sanitizer.js';

export async function loginInteractive(): Promise<boolean> {
  console.log('\n======================================================');
  console.log('   UTN MCP Mendoza — Inicio de Sesión en Campus FRM   ');
  console.log('======================================================\n');
  console.log('1. Se abrirá una ventana de Chromium en modo visible.');
  console.log('2. Ingresá tu usuario y contraseña DIRECTAMENTE en el campus.');
  console.log('   (No se leen las credenciales. El estado del navegador incluye cookies de sesión y se guarda localmente).');
  console.log('3. Una vez que hayas ingresado a tu panel (/my/), este proceso');
  console.log('   guardará automáticamente tu sesión de navegación local.\n');

  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext({
    acceptDownloads: false
  });

  const page = await context.newPage();

  try {
    const loginUrl = new URL(PATHS.login, CAMPUS_ORIGIN).href;
    console.log(`Navegando a la pantalla de acceso: ${loginUrl}...`);
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    console.log('\nEsperando que inicies sesión en la ventana del navegador...');
    console.log('Podés presionar ENTER en esta consola una vez que veas tu página principal.');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    // Esperar de forma dual: o bien el usuario da ENTER, o detectamos que la página navegó a /my/
    const waitNavigationPromise = page.waitForURL(url => {
      const pathname = url.pathname;
      return pathname.includes('/my') || (pathname.startsWith('/course') && !pathname.includes('login'));
    }, { timeout: 180000 }).catch(() => null);

    const waitEnterPromise = rl.question('\nPresioná ENTER cuando hayas completado el ingreso: ').catch(() => '');

    await Promise.race([waitNavigationPromise, waitEnterPromise]);
    rl.close();

    // Pequeña pausa para asegurar que las cookies finales de sesión se hayan asentado
    await page.waitForTimeout(2000);

    // Verificamos si estamos autenticados navegando a /my/ si no estamos allí
    const currentUrl = page.url();
    if (!currentUrl.includes('/my')) {
      await page.goto(new URL(PATHS.dashboard, CAMPUS_ORIGIN).href, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1000);
    }

    const isLogin = await page.evaluate(() => {
      const path = window.location.pathname;
      const hasInputs = Boolean(document.querySelector('input[name="username"], input#username'));
      return path.includes('login') || hasInputs;
    });

    if (isLogin) {
      console.error('\n[Error] Parece que no se completó el inicio de sesión.');
      return false;
    }

    // Guardar el estado de la sesión
    SessionStore.save(await context.storageState());
    SessionStore.protectSessionFile();
    console.log('\n[Éxito] Sesión guardada localmente. El archivo contiene cookies de autenticación: no lo compartas ni lo agregues a Git.');
    console.log('Ya podés utilizar el servidor MCP con asistentes de IA.\n');
    return true;
  } catch (error) {
    const message = sanitizeCampusErrorMessage(error instanceof Error ? error.message : 'Error desconocido');
    console.error('\n[Error durante el inicio de sesión]:', message);
    return false;
  } finally {
    try {
      await context.close();
      await browser.close();
    } catch {
      // Ignorar errores al cerrar
    }
  }
}
