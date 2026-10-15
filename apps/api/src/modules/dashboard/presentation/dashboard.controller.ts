import { Controller, Get, Query } from '@nestjs/common';
import {
  dashboardOvertimeReportQuerySchema,
  type DashboardOvertimeReport,
  type DashboardOvertimeReportQuery,
  type DashboardSummary,
} from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { GetDashboardSummaryUseCase } from '../application/use-cases/get-dashboard-summary.use-case';
import { GetOvertimeReportUseCase } from '../application/use-cases/get-overtime-report.use-case';

/** Sin `@RequirePermissions`: cualquier usuario autenticado puede pedir su resumen — cada sección se filtra sola por permiso, igual que `/auth/me`. */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly getSummary: GetDashboardSummaryUseCase,
    private readonly getOvertimeReport: GetOvertimeReportUseCase,
  ) {}

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

  /** "Horas extra por proyecto" — vista general del PMO/admin, exportable. */
  @Get('overtime-report')
  @RequirePermissions('hours:read_all')
  async overtimeReport(
    @Query(new ZodValidationPipe(dashboardOvertimeReportQuerySchema)) query: DashboardOvertimeReportQuery,
  ): Promise<DashboardOvertimeReport> {
    return unwrapOrThrow(await this.getOvertimeReport.execute({ query }));
  }
}
