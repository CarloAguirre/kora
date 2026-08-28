import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type Clock, type Result } from '@kora/core';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { SESSION_REPOSITORY, type SessionRepository } from '../../../sessions/application/ports/session.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface LogoutCommand {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string;
  /** Cierra la sesión actual o todas las del usuario. */
  readonly allDevices: boolean;
}

/**
 * Cierre de sesión.
 *
 * Es idempotente: cerrar una sesión ya cerrada no falla. El cliente puede
 * reintentar sin miedo, que es justo lo que hace cuando la red va mal.
 */
@Injectable()
export class LogoutUseCase implements UseCase<LogoutCommand, void> {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: LogoutCommand): Promise<Result<void>> {
    const now = this.clock.now();

    if (command.allDevices) {
      await this.sessions.revokeAllForUser(command.userId, 'logout', now);
    } else {
      await this.sessions.revokeById(command.sessionId, 'logout', now);
    }

    await this.audit.record({
      actor: { userId: command.userId, email: command.email },
      action: 'logout',
      entityType: 'user',
      entityId: command.userId,
      metadata: { allDevices: command.allDevices },
    });

    return ok(undefined);
  }
}
