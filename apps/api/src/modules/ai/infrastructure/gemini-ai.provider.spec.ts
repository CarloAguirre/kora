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

  it('transmite resúmenes reales de Gemini y conserva la respuesta JSON de la misma llamada', async () => {
    const summary: string[] = [];
    const sse = [
      'data: '+ JSON.stringify({ candidates: [{ content: { parts: [
        { thought: true, text: 'Analizando el alcance y ' },
      ] } }] }) + '\n\n',
      'data: '+ JSON.stringify({ candidates: [{ content: { parts: [
        { thought: true, text: 'las dependencias del proyecto.' },
        { thought: false, text: '{"stages":' },
      ] } }] }) + '\n\n',
      'data: '+ JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [
        { text: '["T01"]}' },
      ] } }] }) + '\n\n',
    ].join('');
    const encoder = new TextEncoder();
    const encoded = encoder.encode(sse);
    const splitAt = Math.floor(encoded.length / 3);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.subarray(0, splitAt));
        controller.enqueue(encoded.subarray(splitAt));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200,
      headers: { 'Content-Type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(provider().generateStructured(request, (part) => summary.push(part)))
      .resolves.toEqual({ stages: ['T01'] });
    expect(summary).toEqual(['Analizando el alcance y ', 'las dependencias del proyecto.']);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toContain('streamGenerateContent?alt=sse');
    const config = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string) as {
      generationConfig: { thinkingConfig: { includeThoughts: boolean }; responseMimeType: string };
    };
    expect(config.generationConfig.thinkingConfig.includeThoughts).toBe(true);
    expect(config.generationConfig.responseMimeType).toBe('application/json');
  });

  it('no inventa pensamiento si Gemini sólo transmite la respuesta JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      'data: '+JSON.stringify({ candidates: [{ finishReason: 'STOP', content: {
        parts: [{ text: '{"stages":[]}' }],
      } }] })+'\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const thoughts: string[] = [];
    await expect(provider().generateStructured(request, (part) => thoughts.push(part)))
      .resolves.toEqual({ stages: [] });
    expect(thoughts).toEqual([]);
  });

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

  it('SSE preserva HTTP 429 de Gemini y nunca realiza otro request', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
    }), { status: 429 }));
    vi.stubGlobal('fetch', mock);
    const error = await provider().generateStructured(request, () => {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect(mock).toHaveBeenCalledOnce();
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
