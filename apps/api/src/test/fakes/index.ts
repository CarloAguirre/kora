import type { Clock, IdGenerator, TransactionContext, UnitOfWork } from '@kora/core';
import type {
  AuditEntry,
  AuditRecorder,
} from '../../shared/application/ports/audit-recorder.port';
import type {
  AccountStatusNotification,
  NotificationSender,
  PasswordResetNotification,
  ProjectAutoActivatedNotification,
  ProjectInvoiceBlockedNotification,
  ProjectPaymentMilestoneReadyNotification,
  ProjectReactivatedFromHoldNotification,
  UserInvitation,
} from '../../shared/application/ports/notification.port';
import type { OpaqueTokenGenerator } from '../../shared/application/ports/token.port';
import type {
  PasswordAlgorithm,
  PasswordHasher,
  PasswordVerification,
} from '../../shared/application/ports/password-hasher.port';
import type {
  CreateInvitationInput,
  InvitationRecord,
  InvitationRepository,
} from '../../modules/users/application/ports/invitation.port';
import type {
  TeamReader,
  TeamReference,
} from '../../modules/users/application/ports/team-reader.port';
import type {
  SessionRevokeReason,
  SessionRevoker,
} from '../../modules/users/application/ports/session-revoker.port';
import type {
  UpsertCredentialInput,
  UserCredentialRepository,
  UserCredentialState,
} from '../../modules/users/domain/repositories/user-credential.repository';
import type {
  EffectivePermissions,
  PermissionReader,
} from '../../modules/users/application/ports/permission-reader.port';
import { DEFAULT_ROLE_PERMISSIONS, type Permission, type RoleCode } from '@kora/contracts';

/**
 * Dobles de prueba de los puertos transversales.
 *
 * Son implementaciones reales y simples, no mocks generados: se comportan de
 * forma predecible y permiten aserciones directas sobre lo ocurrido
 * (`audit.entries`, `notifications.invitations`) sin sintaxis de espías.
 */

export class FixedClock implements Clock {
  constructor(private current = new Date('2026-08-25T12:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}

export class SequentialIdGenerator implements IdGenerator {
  private counter = 0;

  constructor(private readonly prefix = 'id') {}

  generate(): string {
    this.counter += 1;
    return `${this.prefix}-${String(this.counter).padStart(4, '0')}`;
  }
}

/** Ejecuta el trabajo sin transacción real: en memoria no hay nada que revertir. */
export class PassthroughUnitOfWork implements UnitOfWork {
  calls = 0;

  async run<T>(work: (context: TransactionContext) => Promise<T>): Promise<T> {
    this.calls += 1;
    return work({ _brand: 'TransactionContext' } as TransactionContext);
  }
}

/** Unidad de trabajo que siempre falla, para probar el comportamiento ante error. */
export class FailingUnitOfWork implements UnitOfWork {
  constructor(private readonly error: unknown) {}

  async run<T>(_work: (context: TransactionContext) => Promise<T>): Promise<T> {
    throw this.error;
  }
}

export class RecordingAuditRecorder implements AuditRecorder {
  readonly entries: AuditEntry[] = [];

  async record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  actionsFor(entityId: string): string[] {
    return this.entries.filter((e) => e.entityId === entityId).map((e) => e.action);
  }
}

export class RecordingNotificationSender implements NotificationSender {
  readonly invitations: UserInvitation[] = [];
  readonly resets: PasswordResetNotification[] = [];
  readonly statusChanges: AccountStatusNotification[] = [];
  shouldFail = false;

  async sendUserInvitation(invitation: UserInvitation): Promise<void> {
    if (this.shouldFail) throw new Error('proveedor de correo caído');
    this.invitations.push(invitation);
  }

  async sendPasswordReset(notification: PasswordResetNotification): Promise<void> {
    if (this.shouldFail) throw new Error('proveedor de correo caído');
    this.resets.push(notification);
  }

  async sendAccountStatusChanged(notification: AccountStatusNotification): Promise<void> {
    if (this.shouldFail) throw new Error('proveedor de correo caído');
    this.statusChanges.push(notification);
  }

  readonly projectInvoiceBlocked: ProjectInvoiceBlockedNotification[] = [];
  readonly projectAutoActivated: ProjectAutoActivatedNotification[] = [];
  readonly projectReactivatedFromHold: ProjectReactivatedFromHoldNotification[] = [];
  readonly projectPaymentMilestoneReady: ProjectPaymentMilestoneReadyNotification[] = [];

  async sendProjectInvoiceBlocked(notification: ProjectInvoiceBlockedNotification): Promise<void> {
    if (this.shouldFail) throw new Error('proveedor de correo caído');
    this.projectInvoiceBlocked.push(notification);
  }

  async sendProjectAutoActivated(notification: ProjectAutoActivatedNotification): Promise<void> {
    if (this.shouldFail) throw new Error('proveedor de correo caído');
    this.projectAutoActivated.push(notification);
  }

  async sendProjectReactivatedFromHold(notification: ProjectReactivatedFromHoldNotification): Promise<void> {
    if (this.shouldFail) throw new Error('proveedor de correo caído');
    this.projectReactivatedFromHold.push(notification);
  }

  async sendProjectPaymentMilestoneReady(notification: ProjectPaymentMilestoneReadyNotification): Promise<void> {
    if (this.shouldFail) throw new Error('proveedor de correo caído');
    this.projectPaymentMilestoneReady.push(notification);
  }
}

export class PredictableTokenGenerator implements OpaqueTokenGenerator {
  private counter = 0;

  generate(): { value: string; hash: string } {
    this.counter += 1;
    const value = `token-${this.counter}`;
    return { value, hash: this.hash(value) };
  }

  hash(value: string): string {
    return `hash(${value})`;
  }
}

/** Hasher determinista: sin coste criptográfico, mismo contrato. */
export class FakePasswordHasher implements PasswordHasher {
  readonly currentAlgorithm: PasswordAlgorithm = 'argon2id';

  async hash(plainPassword: string): Promise<string> {
    return `argon2id:${plainPassword}`;
  }

  async verify(
    plainPassword: string,
    hash: string,
    algorithm: PasswordAlgorithm,
  ): Promise<PasswordVerification> {
    const valid = hash === `${algorithm}:${plainPassword}`;
    return { valid, needsRehash: valid && algorithm === 'bcrypt' };
  }
}

export class InMemoryTeamReader implements TeamReader {
  constructor(private readonly teams: TeamReference[] = []) {}

  async findById(teamId: string): Promise<TeamReference | null> {
    return this.teams.find((team) => team.id === teamId) ?? null;
  }

  async findManyByIds(teamIds: readonly string[]): Promise<TeamReference[]> {
    return this.teams.filter((team) => teamIds.includes(team.id));
  }
}

export class InMemoryInvitationRepository implements InvitationRepository {
  readonly records: Array<InvitationRecord & { tokenHash: string }> = [];
  private counter = 0;

  async create(input: CreateInvitationInput): Promise<void> {
    this.counter += 1;
    this.records.push({
      id: `inv-${this.counter}`,
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      usedAt: null,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRecord | null> {
    return this.records.find((record) => record.tokenHash === tokenHash) ?? null;
  }

  async markAsUsed(id: string, at: Date): Promise<void> {
    const record = this.records.find((item) => item.id === id);
    if (record) Object.assign(record, { usedAt: at });
  }

  async invalidateAllForUser(userId: string, at: Date): Promise<void> {
    for (const record of this.records) {
      if (record.userId === userId && !record.usedAt) Object.assign(record, { usedAt: at });
    }
  }
}

export class InMemoryCredentialRepository implements UserCredentialRepository {
  readonly credentials = new Map<string, UserCredentialState>();

  seed(state: UserCredentialState): this {
    this.credentials.set(state.userId, state);
    return this;
  }

  async findByUserId(userId: string): Promise<UserCredentialState | null> {
    return this.credentials.get(userId) ?? null;
  }

  async upsert(input: UpsertCredentialInput): Promise<void> {
    const existing = this.credentials.get(input.userId);
    this.credentials.set(input.userId, {
      userId: input.userId,
      passwordHash: input.passwordHash,
      passwordAlgorithm: input.passwordAlgorithm,
      mustChangePassword: input.mustChangePassword,
      failedAttempts: existing?.failedAttempts ?? 0,
      lockedUntil: existing?.lockedUntil ?? null,
      lastLoginAt: existing?.lastLoginAt ?? null,
      emailVerifiedAt: input.emailVerifiedAt ?? existing?.emailVerifiedAt ?? null,
      passwordUpdatedAt: existing?.passwordUpdatedAt ?? null,
    });
  }

  async updatePassword(
    userId: string,
    passwordHash: string,
    algorithm: PasswordAlgorithm,
    mustChangePassword: boolean,
  ): Promise<void> {
    const existing = this.credentials.get(userId);
    if (!existing) return;
    this.credentials.set(userId, {
      ...existing,
      passwordHash,
      passwordAlgorithm: algorithm,
      mustChangePassword,
      failedAttempts: 0,
      lockedUntil: null,
    });
  }

  async registerSuccessfulLogin(userId: string, at: Date): Promise<void> {
    const existing = this.credentials.get(userId);
    if (!existing) return;
    this.credentials.set(userId, {
      ...existing,
      lastLoginAt: at,
      failedAttempts: 0,
      lockedUntil: null,
    });
  }

  async registerFailedAttempt(userId: string): Promise<number> {
    const existing = this.credentials.get(userId);
    if (!existing) return 0;
    const failedAttempts = existing.failedAttempts + 1;
    this.credentials.set(userId, { ...existing, failedAttempts });
    return failedAttempts;
  }

  async lockUntil(userId: string, until: Date): Promise<void> {
    const existing = this.credentials.get(userId);
    if (existing) this.credentials.set(userId, { ...existing, lockedUntil: until });
  }

  async clearLock(userId: string): Promise<void> {
    const existing = this.credentials.get(userId);
    if (existing) {
      this.credentials.set(userId, { ...existing, lockedUntil: null, failedAttempts: 0 });
    }
  }

  async hasUsablePassword(userId: string): Promise<boolean> {
    return Boolean(this.credentials.get(userId)?.passwordHash);
  }
}

/** Resuelve permisos desde `DEFAULT_ROLE_PERMISSIONS`, con overrides puntuales por rol para el test que lo necesite. */
export class FakePermissionReader implements PermissionReader {
  private readonly overrides = new Map<RoleCode, readonly Permission[]>();

  withRolePermissions(role: RoleCode, permissions: readonly Permission[]): this {
    this.overrides.set(role, permissions);
    return this;
  }

  async forUser(): Promise<EffectivePermissions | null> {
    throw new Error('FakePermissionReader.forUser no está implementado.');
  }

  async forRole(role: RoleCode): Promise<readonly Permission[]> {
    return this.overrides.get(role) ?? DEFAULT_ROLE_PERMISSIONS[role];
  }
}

export class RecordingSessionRevoker implements SessionRevoker {
  readonly revokedUsers: Array<{ userId: string; reason: SessionRevokeReason }> = [];
  readonly revokedSessions: Array<{ sessionId: string; reason: SessionRevokeReason }> = [];

  async revokeAllForUser(userId: string, reason: SessionRevokeReason): Promise<void> {
    this.revokedUsers.push({ userId, reason });
  }

  async revokeById(sessionId: string, reason: SessionRevokeReason): Promise<void> {
    this.revokedSessions.push({ sessionId, reason });
  }
}
