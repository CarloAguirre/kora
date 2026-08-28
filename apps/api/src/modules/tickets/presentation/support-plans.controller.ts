import { Controller, Get, Param } from '@nestjs/common';
import type { SupportProjectSummary } from '@kora/contracts';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { GetSupportPlanSummaryUseCase } from '../application/use-cases/get-support-plan-summary.use-case';

@Controller('support-plans')
export class SupportPlansController {
  constructor(private readonly getSummary: GetSupportPlanSummaryUseCase) {}

  @Get('project/:projectId')
  @RequirePermissions('projects:read')
  async summaryForProject(@Param('projectId') projectId: string): Promise<SupportProjectSummary | null> {
    return unwrapOrThrow(await this.getSummary.execute({ projectId }));
  }
}
