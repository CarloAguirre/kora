import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import { fetchGeminiResponseWithRetry } from './gemini-transient-retry';
import type {
  AiDocumentInput,
  AiProvider,
  AiStructuredRequest,
} from '../application/ports/ai-provider.port';

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string; thought?: boolean }>;
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

@Injectable()
export class GeminiAiProvider implements AiProvider {
  readonly name = 'gemini';

  constructor(private readonly config: AppConfigService) {}

  async generateStructured(input: AiStructuredRequest, onThoughtSummary?: (text: string) => void): Promise<unknown> {
    if (onThoughtSummary) {
      return this.generateStructuredWithSummaries(input, onThoughtSummary);
    }
    const { geminiApiKey, geminiModel } = this.config.ai;
    if (!geminiApiKey) {
      throw new Error('Gemini no está configurado. Define GEMINI_API_KEY.');
    }

    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`,
    );

    let response: Response;
    try {
      // Evita que una solicitud quede indefinidamente en espera. No reintenta
      // automáticamente un timeout, que podría consumir cuota de todas formas.
      response = await fetchGeminiResponseWithRetry(url, {
        method: 'POST',
        signal: AbortSignal.timeout(180_000),
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: buildParts(input) }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(input.responseJsonSchema
              ? { responseSchema: input.responseJsonSchema }
              : {}),
          },
        }),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' ||
          error.name === 'AbortError')) {
        throw new HttpException(
          `Gemini [${input.task}]: tiempo de respuesta agotado. No se reintentó automáticamente para preservar la cuota.`,
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw error;
    }

    // Algunas respuestas de error de Google no son JSON. No permitir que el
    // parseo oculte el HTTP 429 real bajo un 500 genérico.
    const rawBody = await response.text();
    let body: GeminiResponse | null = null;
    try {
      body = JSON.parse(rawBody) as GeminiResponse;
    } catch {
      if (response.ok) {
        throw new HttpException(
          `Gemini [${input.task}]: devolvió una respuesta que no es JSON válido.`,
          HttpStatus.BAD_GATEWAY,
        );
      }
    }
    if (!response.ok) {
      const reason = body?.error?.message?.slice(0, 450) ?? 'Sin detalle del proveedor.';
      const status = body?.error?.status ? ` (${body.error.status})` : '';
      const httpStatus = response.status === 429
        ? HttpStatus.TOO_MANY_REQUESTS
        : response.status === 503 ? HttpStatus.SERVICE_UNAVAILABLE
          : HttpStatus.BAD_GATEWAY;
      const advice = response.status === 429
        ? 'Revisa cuota, facturación y límites en Google AI Studio.'
        : 'Saturación temporal del proveedor; se agotaron los reintentos configurados.';
      throw new HttpException(
        `Gemini [${input.task}] modelo ${geminiModel}: HTTP ${response.status}${status}: ${reason}. ${advice}`,
        httpStatus,
      );
    }

    const candidate = body?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new HttpException(
        `Gemini [${input.task}] devolvió una salida incompleta (${candidate.finishReason}). ` +
        'No se creará una cotización con datos truncados.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const text = candidate?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      throw new HttpException(
        `Gemini [${input.task}] no devolvió contenido estructurado.`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new HttpException(
        `Gemini [${input.task}] devolvió una respuesta JSON incompleta o inválida.`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /** Una sola llamada al modelo: respuesta estructurada y resúmenes de pensamiento
   * marcados por la API como thought=true. NO produce/expone cadenas internas. */
  private async generateStructuredWithSummaries(
    input: AiStructuredRequest,
    onThoughtSummary: (text: string) => void,
  ): Promise<unknown> {
    const { geminiApiKey, geminiModel } = this.config.ai;
    if (!geminiApiKey) throw new Error('Gemini no está configurado. Define GEMINI_API_KEY.');
    const url = new URL(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:streamGenerateContent`,
    );
    url.searchParams.set('alt', 'sse');
    let response: Response;
    try {
      response = await fetchGeminiResponseWithRetry(url, {
        method: 'POST',
        signal: AbortSignal.timeout(180_000),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiApiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: buildParts(input) }],
          generationConfig: {
            responseMimeType: 'application/json',
            ...(input.responseJsonSchema ? { responseSchema: input.responseJsonSchema } : {}),
            thinkingConfig: { includeThoughts: true },
          },
        }),
      });
    } catch (error) {
      if (error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new HttpException(
          `Gemini [${input.task}]: tiempo de respuesta agotado. No se reintentó automáticamente para preservar la cuota.`,
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw error;
    }
    if (!response.ok) {
      let reason = 'Sin detalle del proveedor.';
      try {
        const body = await response.json() as GeminiResponse;
        reason = body.error?.message?.slice(0, 450) ?? reason;
      } catch { /* Respuesta no JSON */ }
      throw new HttpException(
        `Gemini [${input.task}] modelo ${geminiModel}: HTTP ${response.status}: ${reason}. Revisa cuotas y disponibilidad; los reintentos están limitados.`,
        response.status === 429 ? HttpStatus.TOO_MANY_REQUESTS
          : response.status === 503 ? HttpStatus.SERVICE_UNAVAILABLE
            : HttpStatus.BAD_GATEWAY,
      );
    }
    if (!response.body) {
      throw new HttpException('Gemini no entregó un flujo de respuesta.', HttpStatus.BAD_GATEWAY);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let output = '';
    let finishReason: string | undefined;
    let thoughtCharacters = 0;
    const consume = (event: string) => {
      const data = event.split('\n').filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return;
      let frame: GeminiResponse;
      try { frame = JSON.parse(data) as GeminiResponse; } catch {
        throw new HttpException('Gemini envió un fragmento SSE inválido.', HttpStatus.BAD_GATEWAY);
      }
      if (frame.error) {
        throw new HttpException(
          'Gemini interrumpió el análisis: ' + (frame.error.message?.slice(0, 300) ?? 'error de proveedor'),
          HttpStatus.BAD_GATEWAY,
        );
      }
      const candidate = frame.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      for (const part of candidate?.content?.parts ?? []) {
        if (typeof part.text !== 'string') continue;
        if (part.thought === true) {
          // Los fragmentos thought son resúmenes generados para el usuario.
          // Los thoughtSignature (y cualquier detalle cifrado) no se transmiten.
          const available = Math.max(0, 12_000 - thoughtCharacters);
          if (available) {
            const summary = part.text.slice(0, available);
            thoughtCharacters += summary.length;
            if (summary) onThoughtSummary(summary);
          }
        } else {
          output += part.text;
        }
      }
    };
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, '\n');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          consume(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
        }
        if (buffer.length > 2_000_000 || output.length > 2_000_000) {
          throw new HttpException('Gemini excedió el tamaño de respuesta permitido.', HttpStatus.BAD_GATEWAY);
        }
      }
      buffer = (buffer + decoder.decode()).replace(/\r\n/g, '\n');
      if (buffer.trim()) consume(buffer);
    } finally {
      reader.releaseLock();
    }
    if (finishReason && finishReason !== 'STOP') {
      throw new HttpException(
        `Gemini [${input.task}] devolvió una salida incompleta (${finishReason}). No se creará una cotización truncada.`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (!output.trim()) {
      throw new HttpException(
        `Gemini [${input.task}] no devolvió contenido estructurado.`,
        HttpStatus.BAD_GATEWAY,
      );
    }
    try { return JSON.parse(output.trim()) as unknown; }
    catch {
      throw new HttpException(
        `Gemini [${input.task}] devolvió una respuesta JSON incompleta o inválida.`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}

function buildParts(input: AiStructuredRequest): Array<Record<string, unknown>> {
  const documents = input.documents ?? [];
  const parts: Array<Record<string, unknown>> = [
    {
      text: [
        'Tarea:',
        input.task,
        '',
        'Contexto JSON:',
        JSON.stringify(input.context),
        '',
        input.instructions
          ? `Indicaciones adicionales:\n${input.instructions}`
          : 'Sin indicaciones adicionales.',
      ].join('\n'),
    },
  ];

  for (const document of documents) {
    parts.push(...documentParts(document));
  }

  return parts;
}

function documentParts(
  document: AiDocumentInput,
): Array<Record<string, unknown>> {
  if (document.text) {
    return [
      {
        text: [
          '',
          `--- DOCUMENTO: ${document.name} ---`,
          document.text,
          `--- FIN DOCUMENTO: ${document.name} ---`,
        ].join('\n'),
      },
    ];
  }

  if (document.dataBase64) {
    return [
      {
        text: `Documento binario: ${document.name}`,
      },
      {
        inlineData: {
          mimeType: document.mimeType,
          data: document.dataBase64,
        },
      },
    ];
  }

  return [];
}
