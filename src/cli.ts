#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ROOT_DIR } from './config.js';
import { campusClient } from './client/campus-client.js';
import { runReadOnlyCampusChecks } from './cli/read-only-check.js';
import { server } from './server.js';
import { loginInteractive } from './session/auth.js';
import { SessionStore } from './session/session-store.js';
import { handleWhoami } from './tools/whoami.js';
import { approveAssignmentInConsole } from './cli/assignment-approval.js';
import { debugErrorDetails, describeCliError } from './client/friendly-errors.js';
import { sanitizeCampusErrorMessage } from './client/error-sanitizer.js';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { CredentialStore } from './session/credential-store.js';
import { registerClient, type ClientId } from './cli/clients.js';
import { doctorExitCode, formatDoctor, runDoctor } from './cli/doctor.js';
import { installChromium } from './cli/install-browser.js';
import { defaultWizardDeps, runWizard, type WizardIO } from './cli/wizard.js';
import { handleListCourses } from './tools/list-courses.js';
import { describeSessionAge } from './session/session-status.js';
import { buildDigest, notify, scheduleHelp } from './cli/digest.js';

function registerInClient(label: string, id: ClientId): void {
  const printOnly = process.argv.includes('--print');
  const result = registerClient(id, { printOnly });
  if (printOnly) {
    console.log(result.line);
    return;
  }
  console.log('Registrando UTN MCP Mendoza en ' + label + ': ' + result.line);
  if (!result.ok) {
    console.error(result.message ?? 'No se pudo registrar el servidor.');
    process.exitCode = 1;
    return;
  }
  console.log('Listo. Verificá con el comando "mcp list" de tu cliente y reiniciá ' + label + '.');
}

function consoleWizardIO(): WizardIO {
  return {
    say: message => console.log(message ?? ''),
    pick: async (question, items) => {
      items.forEach((item, index) => console.log(`  ${index + 1}. ${item}`));
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = (await rl.question(`${question} Escribí los números separados por coma (Enter = todas): `)).trim();
        if (!answer) return undefined;
        const numbers = [...new Set(answer.split(/[\s,;]+/).map(part => Number.parseInt(part, 10)).filter(value => Number.isInteger(value) && value >= 1 && value <= items.length))];
        return numbers.length > 0 ? numbers.map(value => value - 1) : undefined;
      } finally {
        rl.close();
      }
    },
    prompt: async (question, options) => {
      if (!options?.secret) {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        try { return await rl.question(question); } finally { rl.close(); }
      }
      // Salida silenciada: la terminal no repite lo que se escribe.
      process.stdout.write(question);
      const rl = readline.createInterface({ input: process.stdin, output: new Writable({ write: (_chunk, _encoding, done) => done() }), terminal: true });
      try { return await rl.question(''); } finally { rl.close(); process.stdout.write('\n'); }
    },
    confirm: async (question, defaultYes) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = (await rl.question(`${question} ${defaultYes ? '[S/n]' : '[s/N]'} `)).trim().toLowerCase();
        if (!answer) return defaultYes;
        return ['s', 'si', 'sí', 'y', 'yes'].includes(answer);
      } finally {
        rl.close();
      }
    }
  };
}

async function main(): Promise<void> {
  const command = process.argv[2] || 'start';

  switch (command) {
    case 'start': {
      await server.connect(new StdioServerTransport());
      console.error('UTN MCP Mendoza iniciado sobre transporte stdio.');
      return;
    }
    case 'login': {
      if (!await loginInteractive()) process.exitCode = 1;
      return;
    }
    case 'approve-assignment': {
      const approvalId = process.argv[3] || '';
      try {
        await approveAssignmentInConsole(approvalId);
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'No se pudo aprobar localmente la operación.');
        process.exitCode = 1;
      }
      return;
    }
    case 'logout': {
      let hadSession = false;
      try { hadSession = SessionStore.exists(); } catch { hadSession = true; }
      await SessionStore.clear();
      console.log(hadSession ? 'Se elimino la sesion local de UTN MCP Mendoza.' : 'No habia una sesion local guardada.');
      return;
    }
    case 'forget-credentials': {
      await CredentialStore.clear();
      console.log('Se eliminaron las credenciales UTN guardadas en este equipo.');
      return;
    }
    case 'status': {
      console.log('Estado de la sesión local de UTN MCP Mendoza');
      console.log('Archivo de almacenamiento: ' + SessionStore.getStoragePath());
      if (!SessionStore.exists()) {
        console.log('Estado local: NO ENCONTRADO');
        process.exitCode = 1;
        return;
      }
      try {
        const check = await campusClient.validateSession();
        if (check.valid) {
          console.log('Estado en Campus Virtual: SESIÓN ACTIVA');
          const age = describeSessionAge(SessionStore.savedAt());
          if (age.level !== 'none') console.log('Sesión ' + age.text + '.');
        } else {
          console.log('Estado en Campus Virtual: EXPIRADA O INVÁLIDA');
          if (check.error) console.log('Motivo: ' + sanitizeCampusErrorMessage(check.error));
          console.log('La sesión local se conservó. Ejecutá utn-mcp-mendoza login para renovarla.');
          process.exitCode = 1;
        }
      } finally {
        await campusClient.close();
      }
      return;
    }
    case 'whoami': {
      try {
        const profile = await handleWhoami();
        console.log('Nombre: ' + profile.fullName);
        console.log('Email: ' + (profile.email || 'n/a'));
        if (profile.timezone) console.log('Zona horaria: ' + profile.timezone);
        if (profile.enrolledCourses?.length) {
          console.log('Materias inscriptas: ' + profile.enrolledCourses.length);
          for (const course of profile.enrolledCourses) {
            console.log('  - [' + course.id + '] ' + course.name);
          }
        }
      } catch {
        console.error('No se pudo leer el perfil. Revisá la sesión y los permisos del Campus.');
        process.exitCode = 1;
      } finally {
        await campusClient.close();
      }
      return;
    }
    case 'setup': {
      const executable = ROOT_DIR.replace(/\\/g, '/') + '/dist/index.js';
      const config = {
        claudeDesktop: {
          mcpServers: { 'utn-mendoza': { command: 'node', args: [executable] } }
        },
        antigravity: {
          mcpServers: { utn_mendoza: { command: 'node', args: [executable] } }
        },
        cursor: {
          mcpServers: { 'utn-mendoza': { command: 'node', args: [executable] } }
        },
        vscode: {
          servers: { 'utn-mendoza': { type: 'stdio', command: 'node', args: [executable] } }
        }
      };
      console.log(JSON.stringify(config, null, 2));
      return;
    }
    case 'setup-codex': {
      registerInClient('Codex', 'codex');
      return;
    }
    case 'setup-claude': {
      registerInClient('Claude Code', 'claude');
      return;
    }
    case 'setup-opencode': {
      registerInClient('OpenCode', 'opencode');
      return;
    }
    case 'install-browser': {
      // Las dependencias del sistema piden sudo; solo se instalan si se pide con --with-deps.
      const status = installChromium({ withDeps: process.argv.includes('--with-deps') });
      if (status !== 0) process.exitCode = status;
      return;
    }
    case 'doctor': {
      try {
        const checks = await runDoctor({ offline: process.argv.includes('--offline') });
        console.log(formatDoctor(checks));
        process.exitCode = doctorExitCode(checks);
      } finally {
        await campusClient.close();
      }
      return;
    }
    case 'digest': {
      if (process.argv.includes('--schedule-help')) {
        console.log(scheduleHelp());
        return;
      }
      const daysArg = process.argv.find(arg => arg.startsWith('--days='));
      const days = daysArg ? Number.parseInt(daysArg.split('=')[1], 10) : 7;
      if (!Number.isInteger(days) || days < 1 || days > 60) {
        console.error('--days debe ser un número entre 1 y 60.');
        process.exitCode = 1;
        return;
      }
      try {
        const digest = await buildDigest({ days, allCourses: process.argv.includes('--all-courses') });
        if (process.argv.includes('--json')) console.log(JSON.stringify(digest.data, null, 2));
        else console.log(digest.text);
        if (process.argv.includes('--notify') && !notify(digest.title, digest.summary)) {
          console.error('No se pudo mostrar la notificación del sistema (se necesita notify-send en Linux u osascript en macOS).');
        }
      } catch (error) {
        const message = describeCliError(error);
        console.error(message);
        if (process.argv.includes('--notify')) notify('UTN: no se pudo armar el resumen', /expir|sesi[oó]n/i.test(message) ? 'La sesión del Campus venció: ejecutá utn-mcp-mendoza login' : message);
        process.exitCode = 1;
      } finally {
        await campusClient.close();
      }
      return;
    }
    case 'setup-wizard':
    case 'init': {
      const yes = process.argv.includes('--yes');
      if (!yes && !process.stdin.isTTY) {
        console.error('El asistente hace preguntas: ejecutalo en una terminal interactiva, o agregá --yes para aceptar las opciones por defecto.');
        process.exitCode = 1;
        return;
      }
      try {
        const deps = defaultWizardDeps({
          installBrowser: () => installChromium(),
          login: () => loginInteractive(),
          listCourses: async () => (await handleListCourses()).courses
        });
        const result = await runWizard({
          yes,
          skipLogin: process.argv.includes('--no-login'),
          skipRegister: process.argv.includes('--no-register')
        }, consoleWizardIO(), deps);
        if (!result.ok) process.exitCode = 1;
      } finally {
        await campusClient.close();
      }
      return;
    }
    case 'test': {
      if (!SessionStore.exists()) {
        console.error('No se encontró sesión local. Ejecutá utn-mcp-mendoza login.');
        process.exitCode = 1;
        return;
      }
      const results = await runReadOnlyCampusChecks();
      for (const result of results) {
        console.log('[' + result.status.toUpperCase() + '] ' + result.tool);
      }
      const passed = results.filter(result => result.status === 'passed').length;
      const skipped = results.filter(result => result.status === 'skipped').length;
      const failed = results.filter(result => result.status === 'failed').length;
      console.log(
        'Resultado: ' + passed + ' ejecutadas, ' + skipped + ' omitidas, ' + failed + ' fallidas (' +
        results.length + ' herramientas consideradas).'
      );
      if (failed) process.exitCode = 1;
      return;
    }
    default: {
      console.log('UTN MCP Mendoza');
      console.log('  utn-mcp-mendoza             Inicia el servidor MCP sobre stdio');
      console.log('  utn-mcp-mendoza setup-wizard Asistente guiado: revisa tu equipo, inicia sesión y conecta tu cliente (alias: init)');
      console.log('  utn-mcp-mendoza doctor      Diagnóstico en una pantalla, con qué hacer en cada punto (--offline no consulta al Campus)');
      console.log('  utn-mcp-mendoza digest      Resumen de lo que vence y los avisos nuevos (--days=7, --notify, --json, --all-courses, --schedule-help)');
      console.log('  utn-mcp-mendoza login       Abre el navegador para autenticarte');
      console.log('  utn-mcp-mendoza approve-assignment <id> Revisa y aprueba una entrega desde una terminal local');
      console.log('  utn-mcp-mendoza logout      Elimina la sesión local');
      console.log('  utn-mcp-mendoza forget-credentials Elimina el usuario y la contraseña UTN guardados');
      console.log('  utn-mcp-mendoza status      Comprueba la sesión sin eliminarla');
      console.log('  utn-mcp-mendoza whoami      Muestra tu perfil');
      console.log('  utn-mcp-mendoza setup       Muestra bloques MCP');
      console.log('  utn-mcp-mendoza setup-codex Registra el MCP en Codex (--print solo imprime el comando)');
      console.log('  utn-mcp-mendoza setup-claude Registra el MCP en Claude Code (--print solo imprime el comando)');
      console.log('  utn-mcp-mendoza setup-opencode Registra el MCP en OpenCode (--print solo imprime el comando)');
      console.log('  utn-mcp-mendoza install-browser Instala Chromium compatible con esta versión (--with-deps agrega dependencias del sistema en Linux, requiere sudo)');
      console.log('  utn-mcp-mendoza test        Comprueba lecturas sin guardar contenido ni ejecutar escrituras');
    }
  }
}

main().catch((error: unknown) => {
  console.error(describeCliError(error));
  const details = debugErrorDetails(error);
  if (details) console.error('\n[UTN_MCP_DEBUG]\n' + details);
  process.exitCode = 1;
});
