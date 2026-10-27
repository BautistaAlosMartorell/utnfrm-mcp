const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const stageRoot = fs.mkdtempSync(path.join(projectRoot, '.build-staging-'));
const stageDist = path.join(stageRoot, 'dist');

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}.`);
}

function treeManifest(root) {
  if (!fs.existsSync(root)) return [];
  const entries = [];
  const visit = (directory, prefix = '') => {
    for (const name of fs.readdirSync(directory).sort()) {
      const fullPath = path.join(directory, name);
      const relativePath = path.posix.join(prefix, name);
      const stats = fs.lstatSync(fullPath);
      if (stats.isSymbolicLink()) throw new Error(`No se acepta un symlink dentro del árbol preservado: ${relativePath}`);
      if (stats.isDirectory()) visit(fullPath, relativePath);
      else if (stats.isFile()) {
        const digest = crypto.createHash('sha256').update(fs.readFileSync(fullPath)).digest('hex');
        entries.push(`${relativePath}:${stats.size}:${digest}`);
      } else throw new Error(`Tipo de archivo inesperado en el árbol preservado: ${relativePath}`);
    }
  };
  visit(root);
  return entries;
}

function verifyStagedServer() {
  for (const required of ['index.js', 'cli.js']) {
    if (!fs.existsSync(path.join(stageDist, required))) throw new Error(`Falta dist/${required} en la compilación temporal.`);
  }
  const messages = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'safe-build-check', version: '1.0.0' } } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  ].join('\n') + '\n';
  const result = spawnSync(process.execPath, [path.join(stageDist, 'index.js')], {
    cwd: projectRoot,
    input: messages,
    encoding: 'utf8',
    timeout: 45000
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'La prueba MCP STDIO de la compilación temporal falló.');
  const responses = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const tools = responses.find(response => response.id === 2)?.result?.tools;
  if (!Array.isArray(tools) || tools.length !== 31) throw new Error('La compilación temporal no expuso las 31 herramientas MCP.');
  return tools.length;
}

try {
  run(process.execPath, [
    path.join(projectRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    '--project', path.join(projectRoot, 'tsconfig.json'),
    '--outDir', stageDist
  ], projectRoot);
  const toolCount = verifyStagedServer();

  let backupPath;
  if (fs.existsSync(distPath)) {
    if (!fs.lstatSync(distPath).isDirectory()) throw new Error('dist existe y no es un directorio; no se modificó.');
    const previousManifest = treeManifest(distPath);
    const backupRoot = path.join(projectRoot, '.dist-backups');
    fs.mkdirSync(backupRoot, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = path.join(backupRoot, `dist-${stamp}`);
    fs.renameSync(distPath, backupPath);
    try {
      const preservedManifest = treeManifest(backupPath);
      if (JSON.stringify(previousManifest) !== JSON.stringify(preservedManifest)) {
        throw new Error('La copia de dist no coincide byte a byte.');
      }
    } catch (error) {
      if (!fs.existsSync(distPath) && fs.existsSync(backupPath)) fs.renameSync(backupPath, distPath);
      throw new Error('No se pudo verificar la preservación de dist; se restauró el directorio anterior y se canceló la instalación.', { cause: error });
    }
  }

  try {
    fs.renameSync(stageDist, distPath);
  } catch (error) {
    if (backupPath && !fs.existsSync(distPath)) fs.renameSync(backupPath, distPath);
    throw error;
  }
  console.log(`Build seguro instalado: ${toolCount} herramientas MCP.`);
  if (backupPath) console.log(`Build anterior preservado en ${path.relative(projectRoot, backupPath)}.`);
} finally {
  if (fs.existsSync(stageRoot)) fs.rmSync(stageRoot, { recursive: true, force: true });
}
