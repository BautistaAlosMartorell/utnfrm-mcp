// Genera el paquete .mcpb (extensión de doble clic para Claude Desktop) a partir de la compilación actual.
//   npm run build && npm run package:mcpb
// Sin dependencias nuevas: el .zip se escribe con node:zlib. Requiere red para instalar las dependencias de producción.
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const outDir = path.join(projectRoot, 'release');
const outFile = path.join(outDir, `utn-mcp-mendoza-${pkg.version}.mcpb`);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'utn-mcpb-'));
const stage = path.join(tempRoot, 'bundle');

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} terminó con código ${result.status}.`);
}

function listTools(entry, cwd) {
  const input = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mcpb-build', version: '1.0.0' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { jsonrpc: '2.0', id: 3, method: 'prompts/list', params: {} }
  ].map(message => JSON.stringify(message)).join('\n') + '\n';
  const result = spawnSync(process.execPath, [entry], { cwd, input, encoding: 'utf8', timeout: 45000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'El servidor empaquetado no arrancó.');
  const messages = result.stdout.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const tools = messages.find(message => message.id === 2)?.result?.tools;
  const prompts = messages.find(message => message.id === 3)?.result?.prompts;
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('El servidor empaquetado no expuso herramientas.');
  return { tools, prompts: Array.isArray(prompts) ? prompts : [] };
}

// ── .zip mínimo (método deflate, nombres UTF-8, orden determinista) ──────────────────────────────
function dosDateTime(date) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function writeZip(files) {
  const { time, day } = dosDateTime(new Date());
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const compressed = zlib.deflateRawSync(file.data, { level: 9 });
    const crc = zlib.crc32(file.data);
    const mode = (file.mode ?? 0o644) & 0xffff;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(day, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(file.data.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12); central.writeUInt16LE(day, 14); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(file.data.length, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((mode << 16) >>> 0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function verifyZip(buffer, expectedNames) {
  const endAt = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('El .mcpb no tiene directorio central.');
  const count = buffer.readUInt16LE(endAt + 10);
  let cursor = buffer.readUInt32LE(endAt + 16);
  const names = [];
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Entrada corrupta en el directorio central.');
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localAt = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
    const data = zlib.inflateRawSync(buffer.subarray(dataAt, dataAt + compressedSize));
    if (zlib.crc32(data) !== crc) throw new Error(`CRC incorrecto en ${name}.`);
    names.push(name);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  for (const expected of expectedNames) if (!names.includes(expected)) throw new Error(`Falta ${expected} en el .mcpb.`);
  return names.length;
}

function collect(dir, base = '') {
  const entries = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const relative = path.posix.join(base, name);
    const stats = fs.lstatSync(full);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) entries.push(...collect(full, relative));
    else if (stats.isFile()) entries.push({ name: relative, data: fs.readFileSync(full), mode: stats.mode & 0o777 });
  }
  return entries;
}

try {
  if (!fs.existsSync(path.join(projectRoot, 'dist', 'index.js'))) throw new Error('Falta dist/: ejecutá npm run build primero.');
  fs.mkdirSync(stage, { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'README.md', 'LICENSE']) fs.copyFileSync(path.join(projectRoot, file), path.join(stage, file));
  fs.cpSync(path.join(projectRoot, 'dist'), path.join(stage, 'dist'), { recursive: true });

  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error('Ejecutá este script con npm run package:mcpb.');
  run(process.execPath, [npmCli, 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--cache', path.join(tempRoot, 'npm-cache')], stage);

  const { tools, prompts } = listTools(path.join(stage, 'dist', 'index.js'), stage);
  const manifest = {
    manifest_version: '0.3',
    name: pkg.name,
    display_name: 'UTN FRM · Campus Virtual',
    version: pkg.version,
    description: 'Consultá el Campus Virtual de UTN Facultad Regional Mendoza desde Claude: materias, entregas, avisos, notas y material de estudio. Solo lectura.',
    long_description: 'Servidor MCP local y de solo lectura para el Campus Virtual de UTN FRM. Permite preguntar por materias, próximas entregas, avisos, cuestionarios y notas, leer los archivos que suben las cátedras (PDF, Word, PowerPoint) y armar resúmenes y material de estudio. La contraseña se escribe únicamente en la página del Campus; la sesión se guarda cifrada en tu equipo. Proyecto independiente y no oficial.',
    author: { name: 'Bautista Alós Martorell', url: 'https://github.com/BautistaAlosMartorell/utnfrm-mcp' },
    repository: { type: 'git', url: 'https://github.com/BautistaAlosMartorell/utnfrm-mcp' },
    homepage: 'https://github.com/BautistaAlosMartorell/utnfrm-mcp',
    support: 'https://github.com/BautistaAlosMartorell/utnfrm-mcp/issues',
    license: pkg.license || 'MIT',
    keywords: ['utn', 'frm', 'mendoza', 'moodle', 'campus-virtual', 'estudio'],
    server: {
      type: 'node',
      entry_point: 'dist/index.js',
      mcp_config: {
        command: 'node',
        args: ['${__dirname}/dist/index.js'],
        env: {
          UTN_MCP_ASSIGNMENT_SUBMISSIONS_ENABLED: 'false',
          UTN_MCP_DOWNLOAD_DIR: '${user_config.download_dir}',
          UTN_MCP_EXTERNAL_ALLOW: '${user_config.external_sites}'
        }
      }
    },
    tools: tools.map(tool => ({ name: tool.name, description: String(tool.description || '').split('. ')[0].slice(0, 200) })),
    tools_generated: false,
    prompts: prompts.map(prompt => ({ name: prompt.name, description: prompt.description || prompt.title || prompt.name, text: `Usá el atajo «${prompt.title || prompt.name}» del servidor UTN FRM.` })),
    user_config: {
      download_dir: { type: 'directory', title: 'Carpeta de descargas', description: 'Dónde guardar los archivos que pidas descargar del Campus. Si la dejás vacía se usa Descargas/utn-mcp.', required: false },
      external_sites: { type: 'string', title: 'Sitios externos permitidos (opcional)', description: 'Además de GitHub y Colab, sitios que el MCP puede leer cuando la cátedra los enlaza. Separalos con coma (ej: docs.ejemplo.edu.ar).', required: false }
    },
    compatibility: { platforms: ['darwin', 'win32', 'linux'], runtimes: { node: pkg.engines?.node || '>=22.13.0' } }
  };
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

  const files = collect(stage);
  files.sort((a, b) => (a.name === 'manifest.json' ? -1 : b.name === 'manifest.json' ? 1 : a.name.localeCompare(b.name)));
  const zip = writeZip(files);
  const entries = verifyZip(zip, ['manifest.json', 'dist/index.js', 'package.json']);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, zip);
  const sha = crypto.createHash('sha256').update(zip).digest('hex');
  fs.writeFileSync(`${outFile}.sha256`, `${sha}  ${path.basename(outFile)}\n`);
  console.log(`Paquete creado: ${path.relative(projectRoot, outFile)} (${(zip.length / 1048576).toFixed(1)} MiB, ${entries} archivos, ${tools.length} herramientas, ${prompts.length} atajos).`);
  console.log(`SHA-256: ${sha}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
