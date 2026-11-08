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


  it('muestra progreso SSE antes de recibir la respuesta final y no espera cierre de conexión', async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { writer = controller; },
    }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const encoder = new TextEncoder();
    const events: string[] = [];
    let finished = false;
    const pending = apiEventStream<{ summary: string }>(
      '/estimations/poc/analyze/stream', { projectId: 'p1' },
      (event, data) => { events.push(event + ':' + (data as { text: string }).text); },
    ).then((value) => { finished = true; return value; });

    writer.enqueue(encoder.encode(frame('phase', {
      phase: 'reading', text: 'Drive: archivos autorizados.',
    })));
    await vi.waitFor(() => expect(events).toEqual(['phase:Drive: archivos autorizados.']));
    expect(finished).toBe(false);
    writer.enqueue(encoder.encode(frame('thought', { text: 'Revisando módulo de clientes.' })));
    await vi.waitFor(() => expect(events).toHaveLength(2));
    expect(events[1]).toBe('thought:Revisando módulo de clientes.');
    expect(finished).toBe(false);
    writer.enqueue(encoder.encode(frame('complete', { summary: 'Análisis final' })));
    writer.close();
    await expect(pending).resolves.toEqual({ summary: 'Análisis final' });
    expect(finished).toBe(true);
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
