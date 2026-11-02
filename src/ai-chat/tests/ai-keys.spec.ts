import { afterEach, describe, expect, it, vi } from 'vitest';
import { interpretTestResponse, testAiKey } from '../services/ai-key-tester.js';
import { decryptSecret, encryptSecret, lastFour } from '../utils/ai-key-crypto.util.js';
import { estimateCost } from '../utils/ai-pricing.util.js';
import { AiKeysService } from '../services/ai-keys.service.js';
import type { AiKeysRepository } from '../repositories/ai-keys.repository.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('prueba de llaves', () => {
  it('interpreta las respuestas de los proveedores', async () => {
    expect((await interpretTestResponse('Claude', 'm', json(200, {}))).status).toBe('OK');
    expect((await interpretTestResponse('Claude', 'm', json(401, { error: { message: 'invalid x-api-key' } }))).status).toBe('INVALIDA');
    expect((await interpretTestResponse('Claude', 'm', json(400, { error: { message: 'Your credit balance is too low' } }))).status).toBe('SIN_CREDITO');
    expect((await interpretTestResponse('OpenAI', 'm', json(429, { error: { code: 'insufficient_quota', message: 'You exceeded your current quota' } }))).status).toBe('SIN_CREDITO');
    expect((await interpretTestResponse('OpenAI', 'gpt-x', json(404, { error: { code: 'model_not_found', message: 'The model gpt-x does not exist' } }))).message).toContain('gpt-x');
    expect((await interpretTestResponse('OpenAI', 'm', json(429, { error: { code: 'rate_limit_exceeded', message: 'Rate limit' } }))).status).toBe('OK');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('manda la petición mínima a cada proveedor', async () => {
    const fetchMock = vi.fn(async () => json(200, {}));
    vi.stubGlobal('fetch', fetchMock);
    await testAiKey('claude', 'sk-ant-123', 'claude-sonnet-5-5');
    await testAiKey('openai', 'sk-456', 'gpt-6.1-sol');
    const [claudeUrl, claudeInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(claudeUrl).toBe('https://api.anthropic.com/v1/messages');
    expect((claudeInit.headers as Record<string, string>)['x-api-key']).toBe('sk-ant-123');
    expect(JSON.parse(claudeInit.body as string)).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 1 });
    const [openaiUrl, openaiInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(openaiUrl).toBe('https://api.openai.com/v1/responses');
    expect((openaiInit.headers as Record<string, string>).authorization).toBe('Bearer sk-456');
  });

  it('cifra y descifra; muestra solo 4 caracteres; calcula el costo', () => {
    process.env.JWT_SECRET ??= 'test-secret';
    const encrypted = encryptSecret('sk-ant-abcdef1234');
    expect(encrypted).not.toContain('abcdef');
    expect(decryptSecret(encrypted)).toBe('sk-ant-abcdef1234');
    expect(lastFour('sk-ant-abcdef1234')).toBe('1234');
    // 30k entrada × $2 + 2k salida × $10 por millón = $0.08
    expect(estimateCost('claude', 'claude-sonnet-5-5', 30_000, 2_000)).toBe(0.08);
  });
});

describe('AiKeysService', () => {
  function service(stored: Record<string, unknown> | null = null) {
    const repository = {
      findByProvider: vi.fn(async () => stored),
      findAll: vi.fn(async () => (stored ? [stored] : [])),
      upsert: vi.fn(async () => undefined),
      updateStatus: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    return { keys: new AiKeysService(repository as unknown as AiKeysRepository), repository };
  }

  afterEach(() => vi.unstubAllGlobals());

  it('no guarda una llave inválida', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { error: { message: 'bad' } })));
    const { keys, repository } = service();
    await expect(keys.save('claude', 'sk-ant-invalida-0000000', 'admin@xoco.com')).rejects.toThrow('No se guardó la llave');
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('guarda cifrada una llave sin crédito, con su aviso', async () => {
    process.env.JWT_SECRET ??= 'test-secret';
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { error: { message: 'Your credit balance is too low' } })));
    const { keys, repository } = service();
    const result = await keys.save('claude', 'sk-ant-sin-credito-9999', 'admin@xoco.com');
    expect(result.check.status).toBe('SIN_CREDITO');
    const saved = repository.upsert.mock.calls[0] as unknown as [{ encryptedKey: string; last4: string; status: string }];
    expect(saved[0]).toMatchObject({ last4: '9999', status: 'SIN_CREDITO' });
    expect(saved[0].encryptedKey).not.toContain('sin-credito');
  });

  it('la llave del panel tiene prioridad sobre la del servidor', async () => {
    process.env.JWT_SECRET ??= 'test-secret';
    process.env.OPENAI_API_KEY = 'sk-servidor';
    const { keys } = service({ provider: 'openai', encryptedKey: encryptSecret('sk-panel'), last4: 'anel', status: 'OK' });
    expect(await keys.getApiKey('openai')).toBe('sk-panel');
    const { keys: onlyEnv } = service(null);
    expect(await onlyEnv.getApiKey('openai')).toBe('sk-servidor');
    delete process.env.OPENAI_API_KEY;
  });
});
