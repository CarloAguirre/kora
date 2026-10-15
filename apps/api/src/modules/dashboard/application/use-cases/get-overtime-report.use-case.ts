import { Inject, Injectable } from '@nestjs/common';
import { ok, type ApplicationError, type Result } from '@kora/core';
import type { DashboardOvertimeReport, DashboardOvertimeReportQuery } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { UseCase } from '../../../../shared/application/use-case';

export interface GetOvertimeReportCommand {
  readonly query: DashboardOvertimeReportQuery;
}

/**
 * "Horas Extras" — vista general del PMO/admin (`hours:read_all`, exigido en
 * el controlador): horas extra no rechazadas de un mes en todos los proyectos
 * (soporte y desarrollo), por proyecto × colaborador y con el líder de cada
 * proyecto, para filtrar y exportar. En soporte lo que pasa de la jornada de
 * 8h queda solo como horas extra (ver `CreateTicketHhRequestUseCase`); en
 * desarrollo, las que el colaborador marca en un proyecto que las autoriza.
 */
@Injectable()
export class GetOvertimeReportUseCase implements UseCase<GetOvertimeReportCommand, DashboardOvertimeReport, ApplicationError> {
  constructor(@Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository) {}

  async execute(command: GetOvertimeReportCommand): Promise<Result<DashboardOvertimeReport, ApplicationError>> {
    const { year, month } = command.query;
    const dateFrom = new Date(Date.UTC(year, month - 1, 1));
    const dateTo = new Date(Date.UTC(year, month, 0));

    const rows = await this.hourEntries.sumOvertimeHoursByProjectAndUser(dateFrom, dateTo);
    return ok({ year, month, rows });
  }
}
