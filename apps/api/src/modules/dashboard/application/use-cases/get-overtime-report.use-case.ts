import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { DashboardOvertimeReport, DashboardOvertimeReportQuery, Permission } from '@kora/contracts';
import {
  HOUR_ENTRY_REPOSITORY,
  type HourEntryRepository,
  type OvertimeReportScope,
} from '../../../hours/domain/repositories/hour-entry.repository';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface GetOvertimeReportCommand {
  readonly query: DashboardOvertimeReportQuery;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * "Horas Extras" — horas extra no rechazadas de un mes por día × proyecto ×
 * colaborador, con el líder de cada proyecto, para filtrar y exportar. En
 * soporte lo que pasa de la jornada de 8h queda solo como horas extra (ver
 * `CreateTicketHhRequestUseCase`); en desarrollo, las que el colaborador marca
 * en un proyecto que las autoriza.
 *
 * Alcance (el controlador exige `hours:read_all` o `hours:read_team`):
 * `hours:read_all` (PMO/admin, Administración) ve todos los proyectos;
 * `hours:read_team` (Dashboard del líder) ve las de las personas a su cargo —
 * mismo criterio por fila que la cola de aprobaciones (`leaderScopeUserId`),
 * sin las propias, que decide otro.
 */
@Injectable()
export class GetOvertimeReportUseCase implements UseCase<GetOvertimeReportCommand, DashboardOvertimeReport, ApplicationError> {
  constructor(@Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository) {}

  async execute(command: GetOvertimeReportCommand): Promise<Result<DashboardOvertimeReport, ApplicationError>> {
    const { year, month } = command.query;
    const dateFrom = new Date(Date.UTC(year, month - 1, 1));
    const dateTo = new Date(Date.UTC(year, month, 0));
    const scope: OvertimeReportScope = command.actorPermissions.includes('hours:read_all')
      ? {}
      : { leaderScopeUserId: command.actor.userId, excludeUserId: command.actor.userId };

    const rows = await this.hourEntries.sumOvertimeHoursByDayProjectAndUser(dateFrom, dateTo, scope);
    return ok({ year, month, rows: rows.map((row) => ({ ...row, date: row.date.toISOString().slice(0, 10) })) });
  }
}
