import { BadRequestException, Injectable } from '@nestjs/common';
import { AiProviderKey } from '../providers/provider.types.js';
import { DEFAULT_CLAUDE_MODEL } from '../providers/anthropic.provider.js';
import { DEFAULT_OPENAI_MODEL } from '../providers/openai.provider.js';
import { AiKeysRepository } from '../repositories/ai-keys.repository.js';
import { decryptSecret, encryptSecret, lastFour } from '../utils/ai-key-crypto.util.js';
import { AiKeyCheck, testAiKey } from './ai-key-tester.js';

export const AI_PROVIDERS: { key: AiProviderKey; label: string; envKey: string; envModel: string; defaultModel: string }[] = [
  { key: 'claude', label: 'Claude', envKey: 'ANTHROPIC_API_KEY', envModel: 'AI_CLAUDE_MODEL', defaultModel: DEFAULT_CLAUDE_MODEL },
  { key: 'openai', label: 'ChatGPT', envKey: 'OPENAI_API_KEY', envModel: 'AI_OPENAI_MODEL', defaultModel: DEFAULT_OPENAI_MODEL },
];

const CACHE_MS = 60_000;

export interface AiKeyDoc {
  provider: AiProviderKey;
  label: string;
  model: string;
  /** De dónde sale la llave que se usa: guardada en el panel, variable del servidor o ninguna. */
  source: 'panel' | 'servidor' | null;
  last4: string | null;
  status: string | null;
  statusMessage: string | null;
  checkedAt: Date | null;
  updatedByEmail: string | null;
  updatedAt: Date | null;
}

function definition(provider: AiProviderKey) {
  const found = AI_PROVIDERS.find((item) => item.key === provider);
  if (!found) throw new BadRequestException('Proveedor de IA desconocido.');
  return found;
}

// Llaves de IA: las que guarda el Super admin en el panel (cifradas) tienen
// prioridad sobre las variables de entorno del servidor. Cada llave nueva se
// prueba con una petición mínima antes de guardarse.
@Injectable()
export class AiKeysService {
  private cache = new Map<AiProviderKey, { key: string | null; at: number }>();

  constructor(private readonly repository: AiKeysRepository) {}

  model(provider: AiProviderKey): string {
    const item = definition(provider);
    return process.env[item.envModel]?.trim() || item.defaultModel;
  }

  /** Llave en uso (panel > servidor), con caché corta. */
  async getApiKey(provider: AiProviderKey): Promise<string | null> {
    const cached = this.cache.get(provider);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.key;
    const stored = await this.repository.findByProvider(provider);
    let key: string | null = null;
    if (stored && stored.status !== 'INVALIDA') {
      try {
        key = decryptSecret(stored.encryptedKey);
      } catch {
        key = null;
      }
    }
    key ??= process.env[definition(provider).envKey]?.trim() || null;
    this.cache.set(provider, { key, at: Date.now() });
    return key;
  }

  async list(): Promise<AiKeyDoc[]> {
    const stored = await this.repository.findAll();
    return AI_PROVIDERS.map((item) => {
      const row = stored.find((entry) => entry.provider === item.key);
      const fromEnv = Boolean(process.env[item.envKey]?.trim());
      return {
        provider: item.key,
        label: item.label,
        model: this.model(item.key),
        source: row ? 'panel' : fromEnv ? 'servidor' : null,
        last4: row?.last4 ?? (fromEnv ? lastFour(process.env[item.envKey]!.trim()) : null),
        status: row?.status ?? null,
        statusMessage: row?.statusMessage ?? null,
        checkedAt: row?.checkedAt ?? null,
        updatedByEmail: row?.updatedByEmail ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  }

  /** Prueba la llave y, si sirve (o solo le falta crédito), la guarda cifrada. */
  async save(provider: AiProviderKey, apiKey: string, email: string): Promise<{ check: AiKeyCheck; keys: AiKeyDoc[] }> {
    definition(provider);
    const key = apiKey.trim();
    const check = await testAiKey(provider, key, this.model(provider));
    if (check.status === 'INVALIDA' || check.status === 'ERROR') {
      throw new BadRequestException(`No se guardó la llave. ${check.message}`);
    }
    await this.repository.upsert({
      provider,
      encryptedKey: encryptSecret(key),
      last4: lastFour(key),
      status: check.status,
      statusMessage: check.message,
      updatedByEmail: email,
    });
    this.cache.delete(provider);
    return { check, keys: await this.list() };
  }

  /** Vuelve a probar la llave en uso y guarda el resultado (si es del panel). */
  async test(provider: AiProviderKey): Promise<{ check: AiKeyCheck; keys: AiKeyDoc[] }> {
    definition(provider);
    this.cache.delete(provider);
    const stored = await this.repository.findByProvider(provider);
    const key = stored ? decryptSecret(stored.encryptedKey) : process.env[definition(provider).envKey]?.trim();
    if (!key) throw new BadRequestException('No hay ninguna llave configurada para probar.');
    const check = await testAiKey(provider, key, this.model(provider));
    if (stored) await this.repository.updateStatus(provider, check.status, check.message);
    return { check, keys: await this.list() };
  }

  async remove(provider: AiProviderKey): Promise<AiKeyDoc[]> {
    definition(provider);
    await this.repository.remove(provider);
    this.cache.delete(provider);
    return this.list();
  }
}
