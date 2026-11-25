import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGeminiResponseWithRetry } from './gemini-transient-retry';

const url = new URL('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent');
const init: RequestInit = { method: 'POST', body: '{"test":true}' };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});
describe('Gemini · recuperación de sobrecarga temporal', () => {
  it('recupera HTTP 503 sin alterar el cuerpo ni crear solicitudes ilimitadas', async () => {
    vi.stubEnv('KORA_GEMINI_TRANSIENT_RETRIES', '2');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('overload', { status: 503, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const response = await fetchGeminiResponseWithRetry(url, init);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]).toEqual(fetchMock.mock.calls[1]);
  });
  it('no insiste cuando Google informa cuota agotada o espera superior al límite', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Quota exceeded: daily quota' } }),
      { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchGeminiResponseWithRetry(url, init)).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledOnce();
    const slow = vi.fn().mockResolvedValue(new Response('slow down',
      { status: 429, headers: { 'Retry-After': '60' } }));
    vi.stubGlobal('fetch', slow);
    expect((await fetchGeminiResponseWithRetry(url, init)).status).toBe(429);
    expect(slow).toHaveBeenCalledOnce();
  });
  it('se puede desactivar reintento y nunca reintenta un resultado HTTP 200 incompleto', async () => {
    vi.stubEnv('KORA_GEMINI_TRANSIENT_RETRIES', '0');
    const fetchMock = vi.fn().mockResolvedValue(new Response('partial', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect((await fetchGeminiResponseWithRetry(url, init)).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
