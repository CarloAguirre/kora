import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiEventStream, tokenStore } from './api-client';

afterEach(() => {
  vi.unstubAllGlobals();
  tokenStore.set(null);
});

const frame = (event: string, data: unknown) =>
  'event: '+ event +'\ndata: '+ JSON.stringify(data) +'\n\n';

function streamResponse(data: string): Response {
  const encoded = new TextEncoder().encode(data);
  const split = Math.floor(encoded.length / 3);
  return new Response(new ReadableStream<Uint8Array>({
    start(ctrl) {
      ctrl.enqueue(encoded.slice(0, split));
      ctrl.enqueue(encoded.slice(split));
      ctrl.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('apiEventStream / resumen de Gemini', () => {
  it('recibe eventos incrementales con bearer en memoria y un solo request', async () => {
    tokenStore.set('test-bearer');
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(
      frame('phase', { phase: 'reading', text: 'Leyendo documentos de Drive.' }) +
      frame('thought', { text: 'Identificando alcance.' }) +
      frame('phase', { phase: 'gemini', text: 'Generando el análisis.' }) +
      frame('thought', { text: ' Revisando dependencias.' }) +
      frame('complete', { summary: 'Resultado final', provider: 'gemini' }),
    ));
    vi.stubGlobal('fetch', fetchMock);
    const received: string[] = [];
    const result = await apiEventStream<{ summary: string; provider: string }>(
      '/estimations/poc/analyze/stream', { projectId: 'p1' },
      (event, payload) => {
        const value = payload as { text: string };
        received.push(event + ': ' + value.text);
      },
    );
    expect(received).toEqual([
      'phase: Leyendo documentos de Drive.',
      'thought: Identificando alcance.',
      'phase: Generando el análisis.',
      'thought:  Revisando dependencias.',
    ]);
    expect(result).toEqual({ summary: 'Resultado final', provider: 'gemini' });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/estimations/poc/analyze/stream');
    expect(options.method).toBe('POST');
    expect(options.credentials).toBe('include');
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer test-bearer');
    expect(url).not.toContain('test-bearer');
  });

  it('no repite generación y rechaza errores SSE del servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse(
      frame('thought', { text: 'Evaluando alcance.' }) +
      frame('error', { message: 'Cuota Gemini agotada' }),
    ));
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiEventStream('/estimations/poc/analyze/stream', {}, () => {}))
      .rejects.toThrow('Cuota Gemini agotada');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rechaza fin abrupto si nunca llegó el JSON estructurado final', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(
      frame('thought', { text: 'Resumen parcial' }),
    )));
    await expect(apiEventStream('/estimations/poc/analyze/stream', {}, () => {}))
      .rejects.toThrow('sin entregar un resultado verificable');
  });
});
