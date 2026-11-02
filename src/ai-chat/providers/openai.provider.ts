import { Injectable } from '@nestjs/common';
import { AiProvider, AiProviderError, AiProviderSession, AiSessionInput, AiStep, AiToolResult, providerErrorMessage } from './provider.types.js';

const API_URL = 'https://api.openai.com/v1/responses';
export const DEFAULT_OPENAI_MODEL = 'gpt-6.1-sol';

type ResponseItem = { type: string; [key: string]: unknown };

interface FunctionCallItem {
  type: 'function_call';
  call_id: string;
  name: string;
  arguments: string;
}

interface MessageItem {
  type: 'message';
  content?: { type: string; text?: string }[];
}

function parseArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw || '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// OpenAI (ChatGPT) por la Responses API: los modelos GPT-6.x razonan y solo
// aceptan herramientas (function calling) con razonamiento en /v1/responses,
// no en Chat Completions. Sin guardar nada en OpenAI (store: false): el
// razonamiento cifrado se devuelve en cada paso para no perder el hilo.
// La llave y el modelo los da AiKeysService.
@Injectable()
export class OpenAiProvider implements AiProvider {
  readonly key = 'openai' as const;
  readonly label = 'ChatGPT';

  startSession(input: AiSessionInput): AiProviderSession {
    const { apiKey, model } = input;
    const label = this.label;
    const tools = input.tools.map((tool) => ({
      type: 'function' as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
      // Los esquemas de las herramientas tienen campos opcionales: sin modo estricto.
      strict: false,
    }));
    const items: ResponseItem[] = input.messages.map((message) => ({ type: 'message', role: message.role, content: message.content }));

    return {
      async step(signal?: AbortSignal): Promise<AiStep> {
        const response = await fetch(API_URL, {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            instructions: input.system,
            input: items,
            ...(tools.length ? { tools, tool_choice: 'auto' } : {}),
            ...(input.maxTokens ? { max_output_tokens: input.maxTokens } : {}),
            store: false,
            include: ['reasoning.encrypted_content'],
          }),
        });
        if (!response.ok) throw new AiProviderError(await providerErrorMessage(label, response), response.status);

        const body = (await response.json()) as {
          output?: ResponseItem[];
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const output = body.output ?? [];
        // Todo lo que respondió (razonamiento, texto, llamadas) vuelve como entrada del siguiente paso.
        items.push(...output);

        const text = output
          .filter((item): item is MessageItem & ResponseItem => item.type === 'message')
          .flatMap((item) => item.content ?? [])
          .filter((part) => part.type === 'output_text' && part.text)
          .map((part) => part.text)
          .join('\n')
          .trim();
        const toolCalls = output
          .filter((item): item is FunctionCallItem & ResponseItem => item.type === 'function_call')
          .map((item) => ({ id: item.call_id, name: item.name, input: parseArguments(item.arguments) }));

        return {
          text,
          toolCalls,
          usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
        };
      },

      addToolResults(results: AiToolResult[]) {
        for (const result of results) {
          items.push({ type: 'function_call_output', call_id: result.id, output: result.isError ? `ERROR: ${result.output}` : result.output });
        }
      },
    };
  }
}
