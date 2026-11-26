import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { User } from '../../generated/prisma/index.js';
import { AnthropicProvider } from '../providers/anthropic.provider.js';
import { OpenAiProvider } from '../providers/openai.provider.js';
import { AiChatMessage, AiProvider, AiProviderError, AiProviderKey, AiToolResult } from '../providers/provider.types.js';
import { AiChatToolsService } from './ai-chat-tools.service.js';
import { AiKeysService } from './ai-keys.service.js';
import { AiUsageService } from './ai-usage.service.js';
import { AiChart, AiFile, AiTable, RENDER_TOOL_NAMES, RENDER_TOOLS, parseChart, parseFile, parseTable } from './ai-render-tools.js';

/**
 * Sin límite práctico de pasos: la IA consulta lo que la pregunta necesite.
 * Este tope solo es una red de seguridad contra un bucle infinito (un modelo
 * que repite la misma consulta sin parar). Aun si se llega, el último paso es
 * sin herramientas: responde con lo que ya consultó, nunca se queda a medias.
 */
export const MAX_STEPS = 60;

/** Aviso (casi nunca debería verse) si aun en el último paso no respondió. */
export const STEP_LIMIT_MESSAGE =
  'Llegué al límite de consultas para una sola pregunta. Pídeme algo más concreto (una tienda o un período más corto) y sigo.';

export type AiChatEvent =
  | { type: 'start'; provider: AiProviderKey; label: string; model: string }
  | { type: 'tool'; name: string; title: string }
  | { type: 'text'; text: string }
  | { type: 'chart'; chart: AiChart }
  | { type: 'table'; table: AiTable }
  | { type: 'file'; file: AiFile }
  | { type: 'done'; usage: { inputTokens: number; outputTokens: number }; steps: number }
  | { type: 'error'; message: string };

const CHAT_RULES = `Eres "Xoco IA", el asistente de análisis de Xocolatísimo dentro de su panel. Hablas con el Super admin.

Cómo responder:
- En español, claro y directo, como un analista que le explica a la gerencia. Párrafos cortos; listas solo si ayudan.
- Consulta SIEMPRE los datos con las herramientas antes de dar cifras. Nunca inventes números.
- Di de qué reporte sale cada cifra (ej. "Venta Mensual del panel") y el período exacto.
- Cuando compares meses, tiendas o productos, o haya una tendencia, muestra una gráfica con "mostrar_grafica". Para rankings o detalle con varias columnas, usa "mostrar_tabla". No repitas en el texto todos los números que ya están en la tabla: comenta lo importante.
- Montos en dólares con 2 decimales y separador de miles (ej. $14,532.10). Porcentajes con 1 decimal.
- Si algo no se puede saber con los datos, dilo y sugiere cómo averiguarlo.
- Eres solo de consulta: si te piden cambiar datos, explica que se hace en el panel.
- Usa **negritas** para lo clave. Sin encabezados grandes.
- Consulta todo lo que la pregunta necesite, sin quedarte a medias. Para ser rápido, pide en un mismo paso las consultas que no dependan entre sí y prefiere las herramientas que ya traen totales agregados (por tienda, por mes) antes que el detalle línea por línea.

Archivos:
- SÍ puedes generar archivos: Excel, PDF, CSV, texto (txt), Markdown (md) y JSON, con la herramienta "generar_archivo". Nunca digas que no puedes.
- Cuando te pidan un archivo (o "pásamelo en Excel/PDF", "un reporte para descargar"): consulta los datos, llama a "generar_archivo" con el formato pedido (una tabla por hoja en Excel; en PDF un resumen en "contenido" más las tablas) y responde en una o dos líneas qué trae el archivo. No repitas toda la tabla en el chat.
- Además, toda tabla y gráfica del chat trae botones "Excel" y "PDF" para descargarla.`;

interface RunInput {
  user: User;
  provider: AiProviderKey;
  messages: AiChatMessage[];
  signal?: AbortSignal;
  emit: (event: AiChatEvent) => void;
}

// Bucle del agente de Xoco IA: el modelo pide herramientas (datos del panel
// y de Odoo, o dibujar gráficas/tablas), se ejecutan aquí y se le devuelven
// los resultados hasta que responde sin pedir más.
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);
  private readonly providers: Record<AiProviderKey, AiProvider>;

  constructor(
    anthropic: AnthropicProvider,
    openai: OpenAiProvider,
    private readonly toolsService: AiChatToolsService,
    private readonly keys: AiKeysService,
    private readonly usageService: AiUsageService,
  ) {
    this.providers = { claude: anthropic, openai };
  }

  async config() {
    const providers = await Promise.all(
      (Object.values(this.providers) as AiProvider[]).map(async (provider) => ({
        key: provider.key,
        label: provider.label,
        model: this.keys.model(provider.key),
        available: Boolean(await this.keys.getApiKey(provider.key)),
      })),
    );
    return { providers, maxSteps: MAX_STEPS };
  }

  /** Proveedor listo para usar (con llave), o 400 con un mensaje claro. */
  async resolve(key: AiProviderKey): Promise<{ provider: AiProvider; apiKey: string; model: string }> {
    const provider = this.providers[key];
    if (!provider) throw new BadRequestException('Proveedor de IA desconocido.');
    const apiKey = await this.keys.getApiKey(key);
    if (!apiKey) throw new BadRequestException(`${provider.label} no tiene llave de API. Agrégala en Xoco IA → Llaves de API.`);
    return { provider, apiKey, model: this.keys.model(key) };
  }

  async run({ user, provider: key, messages, signal, emit }: RunInput): Promise<void> {
    const { provider, apiKey, model } = await this.resolve(key);
    const toolbox = await this.toolsService.open(user);
    const usage = { inputTokens: 0, outputTokens: 0 };
    const startedAt = Date.now();
    let steps = 0;
    let toolCalls = 0;
    let status: 'OK' | 'ERROR' | 'DETENIDA' = 'OK';
    let errorMessage: string | null = null;

    try {
      emit({ type: 'start', provider: provider.key, label: provider.label, model });
      const session = provider.startSession({
        apiKey,
        model,
        system: `${CHAT_RULES}\n\n${toolbox.instructions}`,
        tools: [...toolbox.tools, ...RENDER_TOOLS],
        messages,
      });

      while (steps < MAX_STEPS) {
        if (signal?.aborted) {
          status = 'DETENIDA';
          return;
        }
        steps += 1;
        const lastStep = steps === MAX_STEPS;
        const step = await session.step(signal, lastStep ? { allowTools: false } : undefined);
        usage.inputTokens += step.usage.inputTokens;
        usage.outputTokens += step.usage.outputTokens;
        if (step.text) emit({ type: 'text', text: step.text });
        if (step.toolCalls.length === 0) break;
        if (lastStep) {
          // El proveedor ignoró tool_choice "none": no hay más vueltas.
          if (!step.text) emit({ type: 'text', text: STEP_LIMIT_MESSAGE });
          break;
        }

        const results: AiToolResult[] = [];
        for (const call of step.toolCalls) {
          if (call.name === RENDER_TOOL_NAMES.chart) {
            const parsed = parseChart(call.input);
            if ('chart' in parsed) emit({ type: 'chart', chart: parsed.chart });
            results.push({ id: call.id, name: call.name, output: 'error' in parsed ? parsed.error : 'Gráfica mostrada al usuario.', isError: 'error' in parsed });
            continue;
          }
          if (call.name === RENDER_TOOL_NAMES.table) {
            const parsed = parseTable(call.input);
            if ('table' in parsed) emit({ type: 'table', table: parsed.table });
            results.push({ id: call.id, name: call.name, output: 'error' in parsed ? parsed.error : 'Tabla mostrada al usuario.', isError: 'error' in parsed });
            continue;
          }
          if (call.name === RENDER_TOOL_NAMES.file) {
            const parsed = parseFile(call.input);
            if ('file' in parsed) emit({ type: 'file', file: parsed.file });
            results.push({ id: call.id, name: call.name, output: 'error' in parsed ? parsed.error : 'Archivo listo: el usuario ya ve el botón para descargarlo.', isError: 'error' in parsed });
            continue;
          }
          toolCalls += 1;
          emit({ type: 'tool', name: call.name, title: toolbox.titles.get(call.name) ?? call.name });
          const result = await toolbox.call(call.name, call.input);
          results.push({ id: call.id, name: call.name, ...result });
        }
        session.addToolResults(results);
      }

      this.logger.log(`Xoco IA (${provider.key}/${model}) para ${user.email}: ${steps} pasos, ${usage.inputTokens}+${usage.outputTokens} tokens.`);
      emit({ type: 'done', usage, steps });
    } catch (error) {
      if (signal?.aborted) {
        status = 'DETENIDA';
        return;
      }
      const message =
        error instanceof AiProviderError ? error.message : 'Ocurrió un error al consultar la IA. Intenta de nuevo en un momento.';
      if (!(error instanceof AiProviderError)) this.logger.error('Xoco IA falló', error instanceof Error ? error.stack : String(error));
      status = 'ERROR';
      errorMessage = message;
      emit({ type: 'error', message });
    } finally {
      await toolbox.close().catch(() => undefined);
      await this.usageService.record({
        user,
        provider: provider.key,
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        steps,
        toolCalls,
        status,
        errorMessage,
        durationMs: Date.now() - startedAt,
      });
    }
  }
}
