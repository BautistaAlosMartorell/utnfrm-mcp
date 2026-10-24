#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { server } from './server.js';

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('UTN MCP Mendoza iniciado sobre transporte stdio.');
}

main().catch(error => {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error('No se pudo iniciar el servidor MCP:', message);
  process.exitCode = 1;
});
