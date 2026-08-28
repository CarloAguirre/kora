/**
 * Puerto de lectura de auditoría.
 *
 * `AuditRecorder` es de solo escritura a propósito (los casos de uso no
 * deben depender de poder leer lo que acaban de escribir). Este puerto es
 * para lo contrario: pantallas que necesitan mostrar la bitácora de una
 * entidad — el primer consumidor es el panel de historial de forecast (ver
 * docs/DECISION-M6-FORECAST.md), pero es genérico para cualquier módulo futuro.
 */

export interface AuditReaderEntry {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly actorEmail: string | null;
  /** Resuelto por join en infraestructura contra `users`, cuando el actor sigue existiendo. */
  readonly actorName: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly changes: Record<string, { before: unknown; after: unknown }> | null;
  readonly metadata: Record<string, unknown> | null;
  readonly occurredAt: Date;
}

export interface AuditReaderQuery {
  readonly entityType: string;
  /** Filtra por igualdad exacta sobre campos de `metadata` (jsonb). */
  readonly metadataEquals?: Record<string, string>;
  readonly limit?: number;
}

export interface AuditReader {
  list(query: AuditReaderQuery): Promise<AuditReaderEntry[]>;
}

export const AUDIT_READER = Symbol('AuditReader');
