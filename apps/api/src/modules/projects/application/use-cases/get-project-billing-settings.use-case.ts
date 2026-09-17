import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { ProjectBillingSettings } from '@kora/contracts';
import {
  PROJECT_BILLING_SETTINGS_REPOSITORY,
  type ProjectBillingSettingsRepository,
} from '../../domain/repositories/project-billing-settings.repository';
import type { UseCase } from '../../../../shared/application/use-case';

@Injectable()
export class GetProjectBillingSettingsUseCase
  implements UseCase<void, ProjectBillingSettings, ApplicationError>
{
  constructor(
    @Inject(PROJECT_BILLING_SETTINGS_REPOSITORY) private readonly settings: ProjectBillingSettingsRepository,
  ) {}

  async execute(): Promise<Result<ProjectBillingSettings, ApplicationError>> {
    const record = await this.settings.get();
    return ok({
      autoActivateFirstPayment: record.autoActivateFirstPayment,
      updatedAt: record.updatedAt?.toISOString() ?? null,
    });
  }
}
