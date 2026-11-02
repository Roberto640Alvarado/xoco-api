import { AiProviderKey } from '../providers/provider.types.js';

export type AiKeyStatus = 'OK' | 'SIN_CREDITO' | 'INVALIDA' | 'ERROR';

export interface AiKeyCheck {
  status: AiKeyStatus;
  message: string;
}

const TIMEOUT_MS = 20_000;

async function readError(response: Response): Promise<{ message: string; code: string; type: string }> {
  try {
    const body = (await response.json()) as { error?: { message?: string; code?: string; type?: string } };
    return { message: body.error?.message ?? '', code: body.error?.code ?? '', type: body.error?.type ?? '' };
  } catch {
    return { message: '', code: '', type: '' };
  }
}

const NO_CREDIT = /credit|balance|billing|quota|insufficient|payment/i;

// Interpreta la respuesta de la petición de prueba igual para los dos
// proveedores: 200 = sirve; 401/403 = llave mala; sin crédito / cuota; modelo
// sin acceso; límite de uso momentáneo (la llave sí es válida).
export async function interpretTestResponse(label: string, model: string, response: Response): Promise<AiKeyCheck> {
  if (response.ok) return { status: 'OK', message: `La llave funciona y tiene acceso a ${model}.` };
  const error = await readError(response);
  const text = `${error.code} ${error.type} ${error.message}`;
  if (response.status === 401) return { status: 'INVALIDA', message: `${label} rechazó la llave: no es válida o fue revocada.` };
  if (response.status === 403 && !NO_CREDIT.test(text)) {
    return { status: 'INVALIDA', message: `La llave no tiene permiso para usar ${model}.` };
  }
  if (NO_CREDIT.test(text)) {
    return { status: 'SIN_CREDITO', message: `La llave es válida pero la cuenta de ${label} no tiene crédito. Recarga saldo en su consola de facturación.` };
  }
  if (response.status === 404 || /model/i.test(error.code) || /model/i.test(error.message)) {
    return { status: 'ERROR', message: `La llave es válida pero no tiene acceso al modelo ${model}.` };
  }
  if (response.status === 429) return { status: 'OK', message: `La llave es válida (${label} pidió esperar un momento por límite de uso).` };
  return { status: 'ERROR', message: `${label} respondió ${response.status}${error.message ? `: ${error.message.slice(0, 200)}` : '.'}` };
}

/**
 * Petición de prueba mínima (1 palabra) contra el modelo fijo: confirma que
 * la llave es correcta, que la cuenta tiene crédito y acceso al modelo.
 * Cuesta una fracción de centavo.
 */
export async function testAiKey(provider: AiProviderKey, apiKey: string, model: string): Promise<AiKeyCheck> {
  const label = provider === 'claude' ? 'Claude' : 'OpenAI';
  try {
    const response =
      provider === 'claude'
        ? await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
          })
        : await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            signal: AbortSignal.timeout(TIMEOUT_MS),
            headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
            // Misma API que usa el chat (Responses), sin guardar nada en OpenAI.
            body: JSON.stringify({ model, input: 'ping', max_output_tokens: 16, store: false }),
          });
    return await interpretTestResponse(label, model, response);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    return { status: 'ERROR', message: timedOut ? `${label} no respondió a tiempo. Intenta de nuevo.` : `No se pudo contactar a ${label}.` };
  }
}
