import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { server } from '../src/server.js';

describe('MCP server contract', () => {
  it('exposes the existing tools over the official MCP transport contract', async () => {
    const client = new Client({ name: 'utn-mcp-contract-test', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      expect(client.getInstructions()).toMatch(/contenido externo no confiable/i);
      const { tools } = await client.listTools();
      const names = new Set(tools.map(tool => tool.name));
      const byName = new Map(tools.map(tool => [tool.name, tool]));

      expect(names.size).toBe(24);
      for (const name of [
        'list_courses', 'open', 'read_file', 'get_grades', 'list_forums',
        'forum_post_topic', 'forum_reply', 'submit_assignment', 'submit_choice',
        'get_course_contents', 'get_deadlines', 'get_announcements', 'get_quiz_info', 'download_file'
      ]) {
        expect(names.has(name)).toBe(true);
      }
      const assignmentSchema = tools.find(tool => tool.name === 'submit_assignment')?.inputSchema;
      expect(assignmentSchema?.properties).toHaveProperty('attachment_paths');
      expect(assignmentSchema?.required).not.toContain('attachment_paths');
      expect(byName.get('list_courses')?.annotations?.readOnlyHint).toBe(true);
      for (const name of [
        'forum_post_topic', 'forum_reply', 'calendar_add_event', 'submit_choice'
      ]) {
        expect(byName.get(name)?.annotations?.readOnlyHint).toBe(true);
        expect(byName.get(name)?.annotations?.destructiveHint).toBe(false);
        expect(byName.get(name)?.annotations?.idempotentHint).toBe(true);
        expect(byName.get(name)?.annotations?.openWorldHint).toBe(true);
      }
      expect(byName.get('submit_assignment')?.annotations).toMatchObject({
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      });
      expect(byName.get('submit_assignment')?.description).toMatch(/aprobación exacta.*de un uso/i);

      const blockedAssignment = await client.callTool({
        name: 'submit_assignment',
        arguments: { assignment_id: '123', stage: 'execute', approval_id: '00000000-0000-4000-8000-000000000000' }
      });
      expect(blockedAssignment.isError).not.toBe(true);
      expect(JSON.parse(String(blockedAssignment.content[0]?.text)).status).toBe('rejected');
      expect(blockedAssignment.structuredContent).toMatchObject({ status: 'rejected', details: { write_attempted: false } });

      const legacyConfirm = await client.callTool({ name: 'submit_assignment', arguments: { assignment_id: '123', confirm: true } });
      expect(legacyConfirm.isError).toBe(true);

      const blockedWrite = await client.callTool({
        name: 'forum_reply',
        arguments: { discussion_id: '10', message: 'Respuesta de prueba', confirm: true }
      });
      expect(blockedWrite.isError).toBe(true);
      expect(blockedWrite.structuredContent).toMatchObject({
        status: 'error',
        details: { write_attempted: false, writes_enabled: false }
      });

      const preview = await client.callTool({
        name: 'calendar_add_event',
        arguments: {
          name: 'Evento de vista previa',
          date: new Date(Date.now() + 86400000).toISOString(),
          confirm: false
        }
      });
      expect(preview.isError).not.toBe(true);
      expect(JSON.parse(String(preview.content[0]?.text)).status).toBe('preview');
      expect(preview.structuredContent).toMatchObject({ status: 'preview' });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
