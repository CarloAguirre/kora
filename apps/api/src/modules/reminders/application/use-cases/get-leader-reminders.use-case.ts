import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from '@kora/core';
import { teamReportMissingFields, type LeaderReminders, type Permission, type RoleCode } from '@kora/contracts';
import type { UseCase } from '../../../../shared/application/use-case';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { addDays, weekdaysBetween } from '../chile-calendar';
import { findMissingHourDays, MISSING_HOURS_LOOKBACK_DAYS } from '../missing-hour-days';
import { HOUR_REMINDER_READER, type HourReminderReader } from '../ports/hour-reminder-reader.port';
import { LED_PROJECT_READER, type LedProjectReader } from '../ports/led-project-reader.port';

export interface GetLeaderRemindersCommand {
  readonly userId: string;
  readonly role: RoleCode;
  readonly permissions: readonly Permission[];
  /** "Hoy" en Chile (`YYYY-MM-DD`). */
  readonly today: string;
}

const NO_REMINDERS: LeaderReminders = { pendingApprovals: { entries: 0, hours: 0 }, missingHourDays: [], projectsMissingData: [] };

/**
 * Pendientes del líder para la campanita, calculados en vivo — desaparecen
 * solos al resolverse, sin marcarlos como leídos:
 *
 * - Horas por aprobar: mismo alcance que su cola en `/horas/aprobaciones`
 *   (`leaderScopeUserId`), sin sus propios registros, que decide otro.
 * - Horas por registrar: mismo criterio que el correo de las 18:00, pero sin
 *   contar hoy — en plena jornada, hoy todavía no es un hueco.
 * - Datos por completar: proyectos en curso que lidera como Líder PM donde a
 *   algún equipo con horas le faltan HH asignadas o al proyecto le faltan
 *   fechas (`teamReportMissingFields`, el mismo criterio del Reporte de equipo).
 *
 * Solo para el rol líder: admin y PMO trabajan desde la cola general y no
 * reciben avisos por poder aprobarlo todo (igual que el resumen de las 08:00).
 */
@Injectable()
export class GetLeaderRemindersUseCase implements UseCase<GetLeaderRemindersCommand, LeaderReminders, never> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(HOUR_REMINDER_READER) private readonly reader: HourReminderReader,
    @Inject(LED_PROJECT_READER) private readonly ledProjects: LedProjectReader,
  ) {}

  async execute(command: GetLeaderRemindersCommand): Promise<Result<LeaderReminders, never>> {
    const { userId, role, permissions, today } = command;
    if (role !== 'leader') return ok(NO_REMINDERS);

    const [pendingApprovals, missingHourDays, projectsMissingData] = await Promise.all([
      permissions.includes('hours:approve')
        ? this.hourEntries.summarize({ status: 'pending', leaderScopeUserId: userId, excludeUserId: userId })
        : NO_REMINDERS.pendingApprovals,
      permissions.includes('hours:register') ? this.findMissingHourDays(userId, today) : NO_REMINDERS.missingHourDays,
      this.findProjectsMissingData(userId),
    ]);
    return ok({ pendingApprovals, missingHourDays, projectsMissingData });
  }

  private async findMissingHourDays(userId: string, today: string): Promise<LeaderReminders['missingHourDays']> {
    const from = addDays(today, -(MISSING_HOURS_LOOKBACK_DAYS - 1));
    const until = addDays(today, -1);
    const [firstEntryDate, holidays, daily] = await Promise.all([
      this.reader.findFirstEntryDate(userId),
      this.reader.findHolidays(from, until),
      this.reader.sumDailyHours([userId], from, until),
    ]);
    if (!firstEntryDate) return [];

    const nonWorking = new Set(holidays);
    const hoursByDay = new Map(daily.map((row) => [row.date, row.hours]));
    return findMissingHourDays(
      weekdaysBetween(from, until).filter((day) => !nonWorking.has(day)),
      firstEntryDate,
      (date) => hoursByDay.get(date) ?? 0,
    );
  }

  private async findProjectsMissingData(userId: string): Promise<LeaderReminders['projectsMissingData']> {
    const byProject = new Map<string, LeaderReminders['projectsMissingData'][number]>();
    for (const row of await this.ledProjects.listTeamsOfLedProjects(userId)) {
      const missing = teamReportMissingFields(row, row.teamHasHours);
      if (missing.length === 0) continue;
      const item = byProject.get(row.projectId) ?? {
        projectId: row.projectId,
        projectSlug: row.projectSlug,
        projectName: row.projectName,
        clientName: row.clientName,
        missingDates: false,
        teamsWithoutAssignedHours: [],
      };
      byProject.set(row.projectId, {
        ...item,
        missingDates: item.missingDates || missing.includes('dates'),
        teamsWithoutAssignedHours: missing.includes('assigned_hours')
          ? [...item.teamsWithoutAssignedHours, row.teamName]
          : item.teamsWithoutAssignedHours,
      });
    }
    return [...byProject.values()];
  }
}
