#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ROOT_DIR } from './config.js';
import { campusClient } from './client/campus-client.js';
import { runReadOnlyCampusChecks } from './cli/read-only-check.js';
import { server } from './server.js';
import { loginInteractive } from './session/auth.js';
import { SessionStore } from './session/session-store.js';
import { handleWhoami } from './tools/whoami.js';
import { approveAssignmentInConsole } from './cli/assignment-approval.js';

function registerInClient(label: string, binary: string, args: string[]): void {
  const quoted = args.map(arg => /[\s"]/.test(arg) ? '"' + arg + '"' : arg);
  const printed = binary + ' ' + quoted.join(' ');
  if (process.argv.includes('--print')) {
    console.log(printed);
    return;
  }
  console.log('Registrando UTN MCP Mendoza en ' + label + ': ' + printed);
  // En Windows los clientes son .cmd y spawn exige shell; los argumentos ya van entrecomillados.
  const windows = process.platform === 'win32';
  const result = windows
    ? spawnSync(binary + ' ' + quoted.join(' '), { stdio: 'inherit', shell: true })
    : spawnSync(binary, args, { stdio: 'inherit' });
  if (result.error) {
    console.error('No se pudo ejecutar "' + binary + '". Instalalo o ejecutá a mano: ' + printed);
    process.exitCode = 1;
    return;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }
  console.log('Listo. Verificá con: ' + binary + ' mcp list y reiniciá ' + label + '.');
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
        } else {
          console.log('Estado en Campus Virtual: EXPIRADA O INVÁLIDA');
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
      registerInClient('Codex', 'codex', [
        'mcp', 'add', 'utn-mendoza',
        '--env', 'UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED=false',
        '--', 'node', ROOT_DIR.replace(/\\/g, '/') + '/dist/index.js'
      ]);
      return;
    }
    case 'setup-claude': {
      registerInClient('Claude Code', 'claude', [
        'mcp', 'add', 'utn-mendoza', '--scope', 'user',
        '--env', 'UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED=false',
        '--', 'node', ROOT_DIR.replace(/\\/g, '/') + '/dist/index.js'
      ]);
      return;
    }
    case 'setup-opencode': {
      registerInClient('OpenCode', 'opencode', [
        'mcp', 'add', '--global',
        '--env', 'UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED=false',
        'utn-mendoza', '--', 'node', ROOT_DIR.replace(/\\/g, '/') + '/dist/index.js'
      ]);
      return;
    }
    case 'install-browser': {
      const playwrightEntry = fileURLToPath(import.meta.resolve('playwright'));
      const playwrightCli = path.join(path.dirname(playwrightEntry), 'cli.js');
      const browserArgs = process.platform === 'linux'
        ? ['install', '--with-deps', 'chromium']
        : ['install', 'chromium'];
      const result = spawnSync(process.execPath, [playwrightCli, ...browserArgs], { stdio: 'inherit' });
      if (result.error) throw result.error;
      if (result.status !== 0) process.exitCode = result.status ?? 1;
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
      console.log('  utn-mcp-mendoza login       Abre el navegador para autenticarte');
      console.log('  utn-mcp-mendoza approve-assignment <id> Revisa y aprueba una entrega desde una terminal local');
      console.log('  utn-mcp-mendoza logout      Elimina la sesión local');
      console.log('  utn-mcp-mendoza status      Comprueba la sesión sin eliminarla');
      console.log('  utn-mcp-mendoza whoami      Muestra tu perfil');
      console.log('  utn-mcp-mendoza setup       Muestra bloques MCP');
      console.log('  utn-mcp-mendoza setup-codex Registra el MCP en Codex (--print solo imprime el comando)');
      console.log('  utn-mcp-mendoza setup-claude Registra el MCP en Claude Code (--print solo imprime el comando)');
      console.log('  utn-mcp-mendoza setup-opencode Registra el MCP en OpenCode (--print solo imprime el comando)');
      console.log('  utn-mcp-mendoza install-browser Instala Chromium compatible con esta versión');
      console.log('  utn-mcp-mendoza test        Comprueba lecturas sin guardar contenido ni ejecutar escrituras');
    }
  }
}

main().catch(() => {
  console.error('No se pudo completar el comando. Revisá la sesión y los permisos del Campus.');
  process.exitCode = 1;
});
