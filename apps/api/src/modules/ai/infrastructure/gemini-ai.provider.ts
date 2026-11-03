import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import type {
  AiDocumentInput,
  AiProvider,
  AiStructuredRequest,
} from '../application/ports/ai-provider.port';

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
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

  async generateStructured(input: AiStructuredRequest): Promise<unknown> {
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
      response = await fetch(url, {
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
        ? 'Se agotó la cuota o el límite temporal del modelo. No se reintentó.'
        : 'La solicitud fue rechazada por el proveedor; no se reintentó.';
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
