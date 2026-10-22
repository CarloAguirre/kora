import { Injectable } from '@nestjs/common';
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
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
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

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': geminiApiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: buildParts(input),
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          ...(input.responseJsonSchema
            ? { responseSchema: input.responseJsonSchema }
            : {}),
        },
      }),
    });

    const body = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      throw new Error(
        body.error?.message ??
          `Gemini rechazó la solicitud (HTTP ${response.status}).`,
      );
    }

    const text = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim();

    if (!text) {
      throw new Error('Gemini no devolvió contenido estructurado.');
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error('Gemini devolvió una respuesta que no es JSON válido.');
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
