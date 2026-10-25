const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const tempRoot = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'UTN MCP package check-'));
const stagedPackage = path.join(tempRoot, 'package');
const stagedDist = path.join(tempRoot, 'dist');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + ' exited with status ' + result.status);
}

try {
  fs.mkdirSync(stagedPackage, { recursive: true });
  fs.mkdirSync(stagedDist, { recursive: true });

  run(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--project',
    path.join(projectRoot, 'tsconfig.json'),
    '--outDir',
    stagedDist
  ], projectRoot);

  for (const file of ['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'INICIAR-LOGIN.cmd']) {
    fs.copyFileSync(path.join(projectRoot, file), path.join(stagedPackage, file));
  }
  fs.cpSync(stagedDist, path.join(stagedPackage, 'dist'), { recursive: true });

  const manifest = JSON.parse(fs.readFileSync(path.join(stagedPackage, 'package.json'), 'utf8'));
  for (const target of Object.values(manifest.bin || {})) {
    if (!fs.existsSync(path.join(stagedPackage, target))) {
      throw new Error('Missing CLI entrypoint in package: ' + target);
    }
  }
  if (!fs.existsSync(path.join(stagedPackage, 'dist', 'index.js'))) {
    throw new Error('Missing STDIO server entrypoint in package.');
  }

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Run this check through npm run package:check.');
  run(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(tempRoot, 'npm-cache')], stagedPackage);

  const stdioInput = [
    JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'utn-mcp-package-check', version: '1.0.0' }
      }
    }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  ].join('\n') + '\n';
  const stdio = spawnSync(process.execPath, [path.join(stagedPackage, 'dist', 'index.js')], {
    cwd: stagedPackage,
    input: stdioInput,
    encoding: 'utf8',
    timeout: 30000
  });
  if (stdio.error) throw stdio.error;
  if (stdio.status !== 0) throw new Error(stdio.stderr || 'STDIO MCP smoke check failed.');
  const protocolMessages = stdio.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const toolList = protocolMessages.find(message => message.id === 2)?.result?.tools;
  if (!Array.isArray(toolList) || toolList.length !== 19) {
    throw new Error('STDIO MCP smoke check did not discover all 19 tools.');
  }
  const readFileTool = toolList.find(tool => tool.name === 'read_file');
  const readFileProperties = readFileTool?.inputSchema?.properties || {};
  if (!readFileProperties.url || !readFileProperties.page || !readFileProperties.page_size || !readFileProperties.offset || !readFileProperties.ocr) {
    throw new Error('STDIO MCP read_file schema is missing URL, page, page_size, offset, or OCR options.');
  }

  const codexSetup = spawnSync(process.execPath, [path.join(stagedPackage, 'dist', 'cli.js'), 'setup-codex'], {
    cwd: stagedPackage,
    encoding: 'utf8',
    timeout: 30000
  });
  if (codexSetup.error) throw codexSetup.error;
  if (codexSetup.status !== 0 || !codexSetup.stdout.includes('codex mcp add utn-mendoza --env UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED=false -- node')) {
    throw new Error(codexSetup.stderr || 'Packaged Codex setup command did not produce a registration command.');
  }

  const packed = spawnSync(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--cache', path.join(tempRoot, 'npm-cache')], {
    cwd: stagedPackage,
    encoding: 'utf8'
  });
  if (packed.error) throw packed.error;
  if (packed.status !== 0) throw new Error(packed.stderr || 'npm pack --dry-run failed.');
  const output = JSON.parse(packed.stdout);
  const files = output[0]?.files || [];
  const fileNames = files.map(file => file.path);
  for (const required of ['dist/index.js', 'dist/cli.js', 'README.md', 'LICENSE']) {
    if (!fileNames.includes(required)) throw new Error('Package is missing ' + required);
  }
  if (fileNames.some(file => /(^|\/)(\.session|storageState(?:\.[^/]+)?|tests|src)(\/|$)|\.dpapi$/i.test(file))) {
    throw new Error('Package includes a session file or development-only source.');
  }

  const packedTarball = spawnSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', tempRoot, '--cache', path.join(tempRoot, 'npm-cache')], {
    cwd: stagedPackage,
    encoding: 'utf8'
  });
  if (packedTarball.error) throw packedTarball.error;
  if (packedTarball.status !== 0) throw new Error(packedTarball.stderr || 'npm pack failed.');
  const tarballName = JSON.parse(packedTarball.stdout)[0]?.filename;
  if (!tarballName) throw new Error('npm pack did not return a tarball name.');

  const installPrefix = path.join(tempRoot, 'global-install');
  run(process.execPath, [npmCli, 'install', '--global', '--prefix', installPrefix,
    path.join(tempRoot, tarballName), '--ignore-scripts', '--no-audit', '--no-fund',
    '--cache', path.join(tempRoot, 'npm-cache')], projectRoot);
  const installedPackage = path.join(installPrefix, 'node_modules', manifest.name);
  const installedEntrypoint = path.join(installedPackage, 'dist', 'index.js');
  if (!fs.existsSync(installedEntrypoint)) throw new Error('Installed package is missing dist/index.js.');
  const installedStdio = spawnSync(process.execPath, [installedEntrypoint], {
    cwd: installPrefix,
    input: stdioInput,
    encoding: 'utf8',
    timeout: 30000
  });
  if (installedStdio.error) throw installedStdio.error;
  if (installedStdio.status !== 0) throw new Error(installedStdio.stderr || 'Installed package STDIO smoke check failed.');
  const installedMessages = installedStdio.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const installedTools = installedMessages.find(message => message.id === 2)?.result?.tools;
  if (!Array.isArray(installedTools) || installedTools.length !== 19) {
    throw new Error('Installed npm package did not expose all 19 MCP tools.');
  }

  const browserSmoke = spawnSync(process.execPath, ['--input-type=module', '-e',
    "import { chromium } from 'playwright'; const browser = await chromium.launch({ headless: true }); const page = await browser.newPage(); await page.setContent('<title>UTN MCP smoke</title>'); if (await page.title() !== 'UTN MCP smoke') process.exitCode = 1; await browser.close();"], {
    cwd: installedPackage,
    encoding: 'utf8',
    timeout: 60000
  });
  if (browserSmoke.error) throw browserSmoke.error;
  if (browserSmoke.status !== 0) throw new Error(browserSmoke.stderr || 'Packaged Playwright Chromium smoke check failed.');

  const installedCodexSetup = spawnSync(process.execPath, [path.join(installedPackage, 'dist', 'cli.js'), 'setup-codex'], {
    cwd: installPrefix,
    encoding: 'utf8',
    timeout: 10000
  });
  if (installedCodexSetup.error) throw installedCodexSetup.error;
  const installedExecutableForCodex = installedEntrypoint.replace(/\\/g, '/');
  if (installedCodexSetup.status !== 0
    || !installedCodexSetup.stdout.includes('codex mcp add utn-mendoza --env UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED=false -- node')
    || !installedCodexSetup.stdout.includes('node "' + installedExecutableForCodex + '"')) {
    throw new Error(installedCodexSetup.stderr || 'Installed package did not print the Codex registration command.');
  }

  console.log('STDIO MCP smoke check OK: ' + toolList.length + ' tools.');
  console.log('Temporary global npm install OK: ' + installedTools.length + ' tools; Codex registration command available; packaged Chromium launches.');
  console.log('Package dry-run OK: ' + files.length + ' files; no session or development files included.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
