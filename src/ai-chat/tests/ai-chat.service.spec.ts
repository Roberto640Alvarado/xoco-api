import { describe, expect, it, vi } from 'vitest';
import { Role, User } from '../../generated/prisma/index.js';
import { AiChatEvent, AiChatService, MAX_STEPS, STEP_LIMIT_MESSAGE } from '../services/ai-chat.service.js';
import type { AiChatToolsService, AiToolbox } from '../services/ai-chat-tools.service.js';
import type { AiKeysService } from '../services/ai-keys.service.js';
import type { AiUsageService } from '../services/ai-usage.service.js';
import { AiProviderError, type AiProvider, type AiStep, type AiToolResult } from '../providers/provider.types.js';
import { parseChart, parseFile, parseTable } from '../services/ai-render-tools.js';

const USER = { id: 'u1', email: 'admin@xoco.com', role: Role.SUPER_ADMIN } as User;

function fakeProvider(key: 'claude' | 'openai', steps: AiStep[], configured = true) {
  const received: AiToolResult[][] = [];
  const startSession = vi.fn(() => {
    let index = 0;
    return {
      step: vi.fn(async () => {
        const step = steps[Math.min(index, steps.length - 1)];
        index += 1;
        if (step instanceof Error) throw step;
        return step;
      }),
      addToolResults: (results: AiToolResult[]) => received.push(results),
    };
  });
  const provider = { key, label: key === 'claude' ? 'Claude' : 'ChatGPT', startSession } as unknown as AiProvider;
  return { provider, received, startSession, configured };
}

function setup(steps: AiStep[], options: { configured?: boolean } = {}) {
  const claude = fakeProvider('claude', steps, options.configured ?? true);
  const openai = fakeProvider('openai', steps);
  const toolbox: AiToolbox = {
    instructions: 'INSTRUCCIONES MCP',
    tools: [{ name: 'xoco_venta_mensual', description: 'venta', inputSchema: { type: 'object', properties: {} } }],
    titles: new Map([['xoco_venta_mensual', 'Venta Mensual oficial']]),
    call: vi.fn(async () => ({ output: '{"meses":[]}', isError: false })),
    close: vi.fn(async () => undefined),
  };
  const toolsService = { open: vi.fn(async () => toolbox) } as unknown as AiChatToolsService;
  const keys = {
    model: (key: string) => `${key}-model`,
    getApiKey: vi.fn(async (key: string) => (key === 'claude' && !claude.configured ? null : `sk-${key}`)),
  } as unknown as AiKeysService;
  const usageService = { record: vi.fn(async () => undefined) } as unknown as AiUsageService;
  const service = new AiChatService(claude.provider as never, openai.provider as never, toolsService, keys, usageService);
  const events: AiChatEvent[] = [];
  return { service, claude, toolbox, events, usageService, emit: (event: AiChatEvent) => events.push(event) };
}

const usage = { inputTokens: 10, outputTokens: 5 };

describe('AiChatService', () => {
  it('consulta una herramienta, dibuja una gráfica y responde', async () => {
    const ctx = setup([
      { text: '', toolCalls: [{ id: 't1', name: 'xoco_venta_mensual', input: { desdeMes: '2026-05' } }], usage },
      {
        text: '',
        toolCalls: [
          {
            id: 't2',
            name: 'mostrar_grafica',
            input: { titulo: 'Venta', tipo: 'barras', etiquetas: ['May', 'Jun'], series: [{ nombre: 'Centrika', valores: [1, 2] }], formato: 'moneda' },
          },
        ],
        usage,
      },
      { text: 'Centrika creció.', toolCalls: [], usage },
    ]);
    await ctx.service.run({ user: USER, provider: 'claude', messages: [{ role: 'user', content: 'hola' }], emit: ctx.emit });

    expect(ctx.events.map((event) => event.type)).toEqual(['start', 'tool', 'chart', 'text', 'done']);
    expect(ctx.events[1]).toMatchObject({ type: 'tool', title: 'Venta Mensual oficial' });
    expect(ctx.toolbox.call).toHaveBeenCalledWith('xoco_venta_mensual', { desdeMes: '2026-05' });
    expect(ctx.claude.received[1][0]).toMatchObject({ output: 'Gráfica mostrada al usuario.', isError: false });
    expect(ctx.events.at(-1)).toMatchObject({ type: 'done', steps: 3, usage: { inputTokens: 30, outputTokens: 15 } });
    expect(ctx.toolbox.close).toHaveBeenCalled();
    expect(ctx.usageService.record).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'claude', model: 'claude-model', inputTokens: 30, outputTokens: 15, steps: 3, toolCalls: 1, status: 'OK' }),
    );

    const session = ctx.claude.startSession.mock.calls[0] as unknown as [{ apiKey: string; model: string; system: string; tools: { name: string }[] }];
    expect(session[0]).toMatchObject({ apiKey: 'sk-claude', model: 'claude-model' });
    expect(session[0].system).toContain('Xoco IA');
    expect(session[0].system).toContain('INSTRUCCIONES MCP');
    expect(session[0].tools.map((tool) => tool.name)).toEqual(['xoco_venta_mensual', 'mostrar_grafica', 'mostrar_tabla', 'generar_archivo']);
  });

  it('una gráfica mal armada vuelve como error al modelo y no se muestra', async () => {
    const ctx = setup([
      {
        text: '',
        toolCalls: [{ id: 'g', name: 'mostrar_grafica', input: { titulo: 'X', tipo: 'lineas', etiquetas: ['a', 'b'], series: [{ nombre: 's', valores: [1] }] } }],
        usage,
      },
      { text: 'Listo.', toolCalls: [], usage },
    ]);
    await ctx.service.run({ user: USER, provider: 'claude', messages: [{ role: 'user', content: 'x' }], emit: ctx.emit });
    expect(ctx.events.some((event) => event.type === 'chart')).toBe(false);
    expect(ctx.claude.received[0][0]).toMatchObject({ isError: true });
    expect(ctx.claude.received[0][0].output).toContain('deben ser iguales');
  });

  it(`en el paso ${MAX_STEPS} pide responder sin herramientas`, async () => {
    const consulta: AiStep = { text: '', toolCalls: [{ id: 'x', name: 'xoco_venta_mensual', input: {} }], usage };
    const steps: AiStep[] = [...Array.from({ length: MAX_STEPS - 1 }, () => consulta), { text: 'Resumen con lo consultado.', toolCalls: [], usage }];
    const ctx = setup(steps);
    await ctx.service.run({ user: USER, provider: 'claude', messages: [{ role: 'user', content: 'x' }], emit: ctx.emit });
    expect(ctx.toolbox.call).toHaveBeenCalledTimes(MAX_STEPS - 1);
    const session = ctx.claude.startSession.mock.results[0].value as { step: ReturnType<typeof vi.fn> };
    expect(session.step).toHaveBeenLastCalledWith(undefined, { allowTools: false });
    expect(ctx.events.at(-2)).toEqual({ type: 'text', text: 'Resumen con lo consultado.' });
    expect(ctx.events.at(-1)).toMatchObject({ type: 'done', steps: MAX_STEPS });
  });

  it('si aun así pide herramientas en el último paso, avisa y termina', async () => {
    const ctx = setup([{ text: '', toolCalls: [{ id: 'x', name: 'xoco_venta_mensual', input: {} }], usage }]);
    await ctx.service.run({ user: USER, provider: 'claude', messages: [{ role: 'user', content: 'x' }], emit: ctx.emit });
    expect(ctx.toolbox.call).toHaveBeenCalledTimes(MAX_STEPS - 1);
    expect(ctx.events.at(-2)).toEqual({ type: 'text', text: STEP_LIMIT_MESSAGE });
    expect(ctx.events.at(-1)).toMatchObject({ type: 'done', steps: MAX_STEPS });
  });

  it('un error del proveedor llega como evento error, sin romper', async () => {
    const ctx = setup([new AiProviderError('Claude: se alcanzó el límite de uso.', 429) as unknown as AiStep]);
    await ctx.service.run({ user: USER, provider: 'claude', messages: [{ role: 'user', content: 'x' }], emit: ctx.emit });
    expect(ctx.events.at(-1)).toEqual({ type: 'error', message: 'Claude: se alcanzó el límite de uso.' });
    expect(ctx.toolbox.close).toHaveBeenCalled();
    expect(ctx.usageService.record).toHaveBeenCalledWith(expect.objectContaining({ status: 'ERROR', errorMessage: 'Claude: se alcanzó el límite de uso.' }));
  });

  it('rechaza un proveedor sin llave y reporta la configuración', async () => {
    const ctx = setup([], { configured: false });
    await expect(ctx.service.resolve('claude')).rejects.toThrow('no tiene llave de API');
    expect((await ctx.service.config()).providers).toEqual([
      { key: 'claude', label: 'Claude', model: 'claude-model', available: false },
      { key: 'openai', label: 'ChatGPT', model: 'openai-model', available: true },
    ]);
  });
});

describe('gráficas y tablas', () => {
  it('pastel con una sola serie; tabla rellena celdas faltantes', () => {
    expect(parseChart({ titulo: 'P', tipo: 'pastel', etiquetas: ['a'], series: [{ nombre: 'x', valores: [1] }, { nombre: 'y', valores: [2] }] })).toEqual({
      error: 'Una gráfica de pastel lleva una sola serie.',
    });
    const parsed = parseTable({ titulo: 'T', columnas: [{ titulo: 'A' }, { titulo: 'B', formato: 'moneda' }], filas: [['x']] });
    expect(parsed).toEqual({ table: { titulo: 'T', columnas: [{ titulo: 'A' }, { titulo: 'B', formato: 'moneda' }], filas: [['x', null]] } });
  });
});

describe('archivos', () => {
  it('valida el archivo, quita la extensión del nombre y rellena celdas', () => {
    const result = parseFile({
      nombre: 'ventas-octubre.xlsx',
      formato: 'excel',
      tablas: [{ titulo: 'Por tienda', columnas: [{ titulo: 'Tienda' }, { titulo: 'Venta', formato: 'moneda' }], filas: [['Escalón']] }],
    });
    expect(result).toEqual({
      file: {
        nombre: 'ventas-octubre',
        formato: 'excel',
        tablas: [{ titulo: 'Por tienda', columnas: [{ titulo: 'Tienda' }, { titulo: 'Venta', formato: 'moneda' }], filas: [['Escalón', null]] }],
      },
    });
  });

  it('rechaza un archivo vacío o de formato desconocido', () => {
    expect(parseFile({ nombre: 'x', formato: 'pdf' })).toHaveProperty('error');
    expect(parseFile({ nombre: 'x', formato: 'docx', contenido: 'hola' })).toHaveProperty('error');
  });

  it('el archivo llega como evento y la IA sabe que ya se mostró', async () => {
    const ctx = setup([
      { text: '', toolCalls: [{ id: 'f1', name: 'generar_archivo', input: { nombre: 'resumen', formato: 'txt', contenido: 'Hola' } }], usage },
      { text: 'Listo, ahí está el archivo.', toolCalls: [], usage },
    ]);
    await ctx.service.run({ user: USER, provider: 'claude', messages: [{ role: 'user', content: 'x' }], emit: ctx.emit });
    expect(ctx.events).toContainEqual({ type: 'file', file: { nombre: 'resumen', formato: 'txt', contenido: 'Hola' } });
    expect(ctx.claude.received[0][0]).toMatchObject({ isError: false });
    expect(ctx.toolbox.call).not.toHaveBeenCalled();
  });
});
