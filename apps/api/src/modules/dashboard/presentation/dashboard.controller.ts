import { Controller, Get, Query } from '@nestjs/common';
import type { DashboardSummary } from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { GetDashboardSummaryUseCase } from '../application/use-cases/get-dashboard-summary.use-case';

/** Sin `@RequirePermissions`: cualquier usuario autenticado puede pedir su resumen — cada sección se filtra sola por permiso, igual que `/auth/me`. */
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly getSummary: GetDashboardSummaryUseCase) {}

  @Get('summary')
  async summary(@CurrentUser() user: RequestUser, @Query('weekStart') weekStart?: string): Promise<DashboardSummary> {
    return unwrapOrThrow(
      await this.getSummary.execute({
        actor: { userId: user.id, email: user.email },
        actorRole: user.role,
        actorPermissions: user.permissions,
        weekStartIso: weekStart,
      }),
    );
  }
}
