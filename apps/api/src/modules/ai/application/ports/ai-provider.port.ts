export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiDocumentInput {
  readonly name: string;
  readonly mimeType: string;
  /** Texto ya extraído/exportado del documento. */
  readonly text?: string;
  /** Binario base64 para formatos multimodales soportados, actualmente PDF. */
  readonly dataBase64?: string;
}

export interface AiStructuredRequest {
  readonly task: string;
  readonly context: unknown;
  readonly instructions?: string | null;
  readonly documents?: readonly AiDocumentInput[];
  /**
   * JSON Schema opcional para forzar una respuesta estructurada cuando el
   * proveedor lo soporte.
   */
  readonly responseJsonSchema?: Readonly<Record<string, unknown>>;
}

/**
 * Boundary genérico de IA para Kora.
 *
 * Los módulos de negocio no conocen SDKs, modelos ni proveedores concretos.
 * Piden una salida estructurada y validan esa salida con su propio contrato.
 */
export interface AiProvider {
  readonly name: string;
  generateStructured(input: AiStructuredRequest): Promise<unknown>;
}
