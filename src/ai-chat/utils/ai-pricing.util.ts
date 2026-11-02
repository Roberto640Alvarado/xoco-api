import { AiProviderKey } from '../providers/provider.types.js';

// Precio en USD por millón de tokens (entrada / salida), por modelo. Si se
// cambia el modelo por variable de entorno y no está aquí, se usa el precio
// del proveedor (AI_CLAUDE_PRICE_INPUT/OUTPUT, AI_OPENAI_PRICE_INPUT/OUTPUT)
// o el default del modelo fijo. Es un estimado: no incluye descuentos por caché.
const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'gpt-6.1-sol': { input: 2, output: 10 },
  'gpt-6.1-terra': { input: 1, output: 5 },
  'gpt-6-luna': { input: 0.1, output: 0.5 },
};

const DEFAULT_PRICE = { input: 2, output: 10 };

function envNumber(name: string): number | undefined {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 && process.env[name]?.trim() ? value : undefined;
}

export function priceFor(provider: AiProviderKey, model: string): { input: number; output: number } {
  const prefix = provider === 'claude' ? 'AI_CLAUDE_PRICE' : 'AI_OPENAI_PRICE';
  const base = MODEL_PRICES[model] ?? DEFAULT_PRICE;
  return { input: envNumber(`${prefix}_INPUT`) ?? base.input, output: envNumber(`${prefix}_OUTPUT`) ?? base.output };
}

/** Costo estimado en USD, redondeado a 6 decimales. */
export function estimateCost(provider: AiProviderKey, model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(provider, model);
  const cost = (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
