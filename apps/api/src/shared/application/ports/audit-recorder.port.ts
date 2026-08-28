/**
 * Puerto de auditoría.
 *
 * Los casos de uso registran QUÉ pasó en términos de negocio; dónde acabe ese
 * registro (tabla, cola, servicio externo) es decisión de infraestructura.
 */

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'restore'
  | 'status_change'
  | 'role_change'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'password_change'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'access_granted'
  | 'access_revoked';

export interface AuditActor {
  readonly userId: string | null;
  readonly email: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly requestId?: string | null;
}

export interface AuditEntry {
  readonly actor: AuditActor;
  readonly action: AuditAction;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly changes?: Record<string, { before: unknown; after: unknown }>;
  readonly metadata?: Record<string, unknown>;
}

export interface AuditRecorder {
  record(entry: AuditEntry): Promise<void>;
}

export const AUDIT_RECORDER = Symbol('AuditRecorder');
