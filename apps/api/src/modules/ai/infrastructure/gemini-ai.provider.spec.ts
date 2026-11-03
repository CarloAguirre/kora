import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { AppConfigService } from '../../../config/app-config.service';
import { GeminiAiProvider } from './gemini-ai.provider';

const provider = () => new GeminiAiProvider({
  ai: { geminiApiKey: 'not-a-real-key', geminiModel: 'gemini-test' },
} as unknown as AppConfigService);

const request = {
  task: 'estimation.poc.reference-edt',
  context: { allowedRoles: [{ role: 'Desarrollo' }] },
  instructions: 'Devuelve un objeto válido.',
  responseJsonSchema: {
    type: 'OBJECT',
    properties: { stages: { type: 'ARRAY', items: { type: 'STRING' } } },
    required: ['stages'],
  },
};

describe('GeminiAiProvider · respuestas de infraestructura sin llamadas reales', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envía esquema estructurado y conserva la respuesta sin modificar HH', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: 'STOP', content: {
        parts: [{ text: '{"stages":["T01"]}' }],
      } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(provider().generateStructured(request)).resolves.toEqual({ stages: ['T01'] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      generationConfig: { responseMimeType: string; responseSchema: unknown };
    };
    expect(sent.generationConfig.responseMimeType).toBe('application/json');
    expect(sent.generationConfig.responseSchema).toEqual(request.responseJsonSchema);
  });

  it('identifica cuota agotada con HTTP 429, sin hacer segundo request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
    }), { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const error = await provider().generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toMatch(/cuota|límite/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza fin por MAX_TOKENS para no guardar una EDT incompleta', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      candidates: [{ finishReason: 'MAX_TOKENS',
        content: { parts: [{ text: '{"stages":[]}' }] } }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().generateStructured(request))
      .rejects.toThrow(/incompleta \(MAX_TOKENS\)/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distingue 503 no JSON del proveedor de un 400 local de validación', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('<html>temporarily unavailable</html>', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const error = await provider().generateStructured(request).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect((error as HttpException).message).toMatch(/HTTP 503/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('distingue JSON parcial de Gemini y nunca retorna el resultado cortado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"candidates":[{"content":{"parts":[{"text":"{\\\"a\\\":"}]}}]}',
        { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().generateStructured(request))
      .rejects.toThrow(/JSON incompleta o inválida/);
  });
});
