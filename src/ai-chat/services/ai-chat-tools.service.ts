import { Injectable } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { User } from '../../generated/prisma/index.js';
import { McpToolsService } from '../../mcp/services/mcp-tools.service.js';
import { AiToolDefinition } from '../providers/provider.types.js';

const MAX_TOOL_OUTPUT = 24_000;

export interface AiToolbox {
  instructions: string;
  tools: AiToolDefinition[];
  titles: Map<string, string>;
  call(name: string, input: Record<string, unknown>): Promise<{ output: string; isError: boolean }>;
  close(): Promise<void>;
}

// Las mismas herramientas de solo lectura del conector MCP (ventas, metas,
// inventario, kardex, Odoo), usadas dentro del proceso con un cliente MCP en
// memoria: un solo lugar define qué se puede consultar y con qué permisos.
@Injectable()
export class AiChatToolsService {
  constructor(private readonly mcpTools: McpToolsService) {}

  async open(user: User): Promise<AiToolbox> {
    const server = this.mcpTools.createServer(user);
    const client = new Client({ name: 'xoco-ia', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const { tools } = await client.listTools();
    const definitions: AiToolDefinition[] = tools
      .filter((tool) => tool.name !== 'whoami')
      .map((tool) => {
        const { $schema: _ignored, ...schema } = tool.inputSchema as Record<string, unknown>;
        return { name: tool.name, description: tool.description ?? tool.title ?? tool.name, inputSchema: schema };
      });

    return {
      instructions: client.getInstructions() ?? '',
      tools: definitions,
      titles: new Map(tools.map((tool) => [tool.name, tool.title ?? tool.name])),
      async call(name, input) {
        try {
          const result = await client.callTool({ name, arguments: input });
          const content = (result.content as { type: string; text?: string }[] | undefined) ?? [];
          let output = content
            .filter((item) => item.type === 'text')
            .map((item) => item.text ?? '')
            .join('\n');
          if (output.length > MAX_TOOL_OUTPUT) {
            output = `${output.slice(0, MAX_TOOL_OUTPUT)}\n…[recortado: pide un rango más chico o usa una herramienta agregada]`;
          }
          return { output: output || '(sin datos)', isError: Boolean(result.isError) };
        } catch (error) {
          return { output: error instanceof Error ? error.message : String(error), isError: true };
        }
      },
      async close() {
        await client.close();
        await server.close();
      },
    };
  }
}
