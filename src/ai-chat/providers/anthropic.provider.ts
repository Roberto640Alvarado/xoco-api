import { Injectable } from '@nestjs/common';
import {
  AiChatMessage,
  AiSessionInput,
  AiProvider,
  AiProviderError,
  AiProviderSession,
  AiStep,
  AiToolResult,
  providerErrorMessage,
} from './provider.types.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-5-5';
const MAX_TOKENS = 4096;

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  | { type: string; [key: string]: unknown };

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

// Claude por la Messages API (fetch directo, sin SDK). La llave y el
// modelo los da AiKeysService (panel o variable del servidor).
@Injectable()
export class AnthropicProvider implements AiProvider {
  readonly key = 'claude' as const;
  readonly label = 'Claude';


  startSession(input: AiSessionInput): AiProviderSession {
    const { apiKey, model } = input;
    const label = this.label;
    const tools = input.tools.map((tool) => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));
    const messages: AnthropicMessage[] = input.messages.map((message) => ({ role: message.role, content: message.content }));

    return {
      async step(signal?: AbortSignal): Promise<AiStep> {
        const response = await fetch(API_URL, {
          method: 'POST',
          signal,
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ model, max_tokens: input.maxTokens ?? MAX_TOKENS, system: input.system, ...(tools.length ? { tools } : {}), messages }),
        });
        if (!response.ok) throw new AiProviderError(await providerErrorMessage(label, response), response.status);

        const body = (await response.json()) as {
          content: ContentBlock[];
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        messages.push({ role: 'assistant', content: body.content });

        const text = body.content
          .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        const toolCalls = body.content
          .filter((block): block is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => block.type === 'tool_use')
          .map((block) => ({ id: block.id, name: block.name, input: block.input ?? {} }));

        return {
          text,
          toolCalls,
          usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
        };
      },

      addToolResults(results: AiToolResult[]) {
        messages.push({
          role: 'user',
          content: results.map((result) => ({
            type: 'tool_result',
            tool_use_id: result.id,
            content: result.output,
            ...(result.isError ? { is_error: true } : {}),
          })),
        });
      },
    };
  }
}
