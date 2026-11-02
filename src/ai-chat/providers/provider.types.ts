// Tipos comunes a los proveedores de IA (Claude y OpenAI): el bucle del
// agente (AiChatService) no sabe de qué API viene cada paso.

export type AiProviderKey = 'claude' | 'openai';

/** Herramienta en formato neutro (JSON Schema de entrada). */
export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AiToolResult {
  id: string;
  name: string;
  output: string;
  isError: boolean;
}

export interface AiStep {
  text: string;
  toolCalls: AiToolCall[];
  usage: { inputTokens: number; outputTokens: number };
}

/** Mensaje del historial que manda el panel (solo texto). */
export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Una conversación en curso con un proveedor: guarda sus mensajes en su propio formato. */
export interface AiProviderSession {
  step(signal?: AbortSignal): Promise<AiStep>;
  addToolResults(results: AiToolResult[]): void;
}

export interface AiSessionInput {
  apiKey: string;
  model: string;
  system: string;
  tools: AiToolDefinition[];
  messages: AiChatMessage[];
  /** Tope de tokens de salida (ej. para generar el título de un chat). */
  maxTokens?: number;
}

export interface AiProvider {
  readonly key: AiProviderKey;
  readonly label: string;
  startSession(input: AiSessionInput): AiProviderSession;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Mensaje corto y seguro del error de un proveedor (sin llaves ni cuerpos largos). */
export async function providerErrorMessage(label: string, response: Response): Promise<string> {
  let detail = '';
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? '';
  } catch {
    detail = '';
  }
  if (response.status === 401 || response.status === 403) return `${label}: la llave de la API no es válida o no tiene permiso.`;
  if (response.status === 429) return `${label}: se alcanzó el límite de uso. Intenta en un momento.`;
  if (response.status >= 500) return `${label} no está respondiendo (error ${response.status}). Intenta de nuevo.`;
  return `${label} rechazó la consulta (${response.status})${detail ? `: ${detail.slice(0, 300)}` : '.'}`;
}
