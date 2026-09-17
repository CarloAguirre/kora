import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { SupportProjectSummary } from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetSupportPlanSummaryCommand {
  readonly projectId: string;
}

/** Ficha de UN proyecto (`SupportProjectDetailView`, navegación directa ticket→proyecto). El armado del resumen vive en `SupportPlanSummaryBuilder` — lo comparte con `GetSupportPlanUseCase` (ficha del contrato completo). */
@Injectable()
export class GetSupportPlanSummaryUseCase implements UseCase<GetSupportPlanSummaryCommand, SupportProjectSummary | null, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    private readonly summaryBuilder: SupportPlanSummaryBuilder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: GetSupportPlanSummaryCommand): Promise<Result<SupportProjectSummary | null, ApplicationError>> {
    const plan = await this.plans.findActiveForProjectOrLinked(command.projectId);
    if (!plan) return ok(null);

    const linkedProjectIds = await this.summaryBuilder.resolveLinkedProjectIds(plan);
    return ok(await this.summaryBuilder.build(plan, linkedProjectIds, this.clock.now()));
  }
}
