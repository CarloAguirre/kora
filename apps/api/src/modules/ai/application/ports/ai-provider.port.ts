export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiStructuredRequest {
  readonly task: string;
  readonly context: unknown;
  readonly instructions?: string | null;
}

/**
 * Boundary genérico de IA para Kora.
 *
 * Los módulos de negocio no conocen SDKs, modelos ni proveedores concretos.
 * Piden una salida estructurada y validan esa salida con su propio contrato.
 */
export interface AiProvider {
  generateStructured(input: AiStructuredRequest): Promise<unknown>;
}
