/** Reintentos HTTP acotados de Gemini. Solo antes de recibir respuesta exitosa:
 * nunca repetir un SSE parcialmente consumido ni una respuesta MAX_TOKENS.
 * Retry-After es un mínimo, no un objetivo negociable. Si pide más que el
 * presupuesto de espera, devolvemos el 429/503 original sin reintentar.
 */
const MAX_RETRY_DELAY_MS = 10_000;
const temporaryCodes = new Set([408, 429, 500, 502, 503, 504]);
const quotaOrBilling = /quota exceeded|daily quota|per day|billing|insufficient credits|prepay|credit balance|spend cap/i;

function retryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const timestamp = Date.parse(header);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

/** Permite desactivar reintentos en entornos de costo controlado mediante
 * KORA_GEMINI_TRANSIENT_RETRIES=0 (valores aceptados 0, 1, 2; por defecto 2).
 */
export async function fetchGeminiResponseWithRetry(url: URL, init: RequestInit): Promise<Response> {
  const configured = process.env.KORA_GEMINI_TRANSIENT_RETRIES;
  const retries = configured === '0' ? 0 : configured === '1' ? 1 : 2;
  for (let attempt = 0; ; attempt++) {
    // El mismo AbortSignal del llamador limita TODA la operación; timeout/red
    // no se reintenta automáticamente por posible consumo de tokens remoto.
    const response = await fetch(url, init);
    if (response.ok || attempt >= retries || !temporaryCodes.has(response.status)) {
      return response;
    }
    if (response.status === 429) {
      let detail = '';
      try { detail = (await response.clone().text()).slice(0, 1000); }
      catch { /* Google puede enviar un cuerpo ilegible. */ }
      if (quotaOrBilling.test(detail)) return response;
    }
    const serverDelay = retryAfterMs(response.headers.get('retry-after'));
    if (serverDelay !== null && serverDelay > MAX_RETRY_DELAY_MS) return response;
    const delay = serverDelay ?? Math.min(MAX_RETRY_DELAY_MS,
      Math.round(350 * Math.pow(2, attempt) + Math.random() * 160));
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}
