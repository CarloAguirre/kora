import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { UpdateProjectBillingSettingsInput } from '@kora/contracts';
import {
  PROJECT_BILLING_SETTINGS_REPOSITORY,
  type ProjectBillingSettingsRepository,
} from '../../domain/repositories/project-billing-settings.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectBillingSettingsCommand {
  readonly data: UpdateProjectBillingSettingsInput;
  readonly actor: ActorContext;
}

/** Interruptor global de Hito 0 — decisión de Gerencia (`admin`/`pmo`, `projects:manage`). */
@Injectable()
export class UpdateProjectBillingSettingsUseCase
  implements UseCase<UpdateProjectBillingSettingsCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_BILLING_SETTINGS_REPOSITORY) private readonly settings: ProjectBillingSettingsRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectBillingSettingsCommand): Promise<Result<void, ApplicationError>> {
    await this.settings.update(command.data.autoActivateFirstPayment, command.actor.userId, this.clock.now());

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project_billing_settings',
      entityId: 'singleton',
      metadata: { autoActivateFirstPayment: command.data.autoActivateFirstPayment },
    });

    return ok(undefined);
  }
}
