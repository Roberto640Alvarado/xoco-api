import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAiProvider } from '../providers/openai.provider.js';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('OpenAiProvider (Responses API)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('pide herramientas por /v1/responses y devuelve razonamiento y resultados en el siguiente paso', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          output: [
            { type: 'reasoning', id: 'rs_1', encrypted_content: 'xyz', summary: [] },
            { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'xoco_tiendas', arguments: '{"a":1}' },
          ],
          usage: { input_tokens: 100, output_tokens: 20 },
        }),
      )
      .mockResolvedValueOnce(json({ output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hay 4 tiendas.' }] }], usage: { input_tokens: 150, output_tokens: 10 } }));
    vi.stubGlobal('fetch', fetchMock);

    const session = new OpenAiProvider().startSession({
      apiKey: 'sk-test',
      model: 'gpt-6.1-sol',
      system: 'SISTEMA',
      tools: [{ name: 'xoco_tiendas', description: 'Tiendas', inputSchema: { type: 'object', properties: {} } }],
      messages: [{ role: 'user', content: '¿Cuántas tiendas?' }],
    });

    const first = await session.step();
    expect(first.toolCalls).toEqual([{ id: 'call_1', name: 'xoco_tiendas', input: { a: 1 } }]);
    expect(first.usage).toEqual({ inputTokens: 100, outputTokens: 20 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ model: 'gpt-6.1-sol', instructions: 'SISTEMA', store: false, include: ['reasoning.encrypted_content'] });
    expect(body.tools[0]).toMatchObject({ type: 'function', name: 'xoco_tiendas', strict: false });

    session.addToolResults([{ id: 'call_1', name: 'xoco_tiendas', output: '[4 tiendas]', isError: false }]);
    const second = await session.step();
    expect(second.text).toBe('Hay 4 tiendas.');
    const secondInput = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string).input as { type: string }[];
    expect(secondInput.map((item) => item.type)).toEqual(['message', 'reasoning', 'function_call', 'function_call_output']);
  });
});
