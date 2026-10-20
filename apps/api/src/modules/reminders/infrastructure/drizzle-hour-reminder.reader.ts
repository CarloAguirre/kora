import { Inject, Injectable } from '@nestjs/common';
import { and, between, eq, inArray, isNull, min, sql } from 'drizzle-orm';
import {
  holidays,
  hourEntries,
  permissions,
  projects,
  projectTeams,
  rolePermissions,
  teamMembers,
  teams,
  ticketHhRequests,
  tickets,
  users,
  type Database,
} from '@kora/db';
import { DATABASE } from '../../../shared/infrastructure/database/database.module';
import type {
  DailyHours,
  HourReminderReader,
  HoursRegistrant,
  PendingHourEntryRow,
  ReminderRecipient,
} from '../application/ports/hour-reminder-reader.port';

const isActiveUser = and(eq(users.status, 'active'), isNull(users.deletedAt));

@Injectable()
export class DrizzleHourReminderReader implements HourReminderReader {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findHoursRegistrants(): Promise<HoursRegistrant[]> {
    const firstEntries = this.db
      .select({ userId: hourEntries.userId, date: hourEntries.date })
      .from(hourEntries)
      .unionAll(this.db.select({ userId: ticketHhRequests.userId, date: ticketHhRequests.date }).from(ticketHhRequests))
      .as('first_entries');

    const rows = await this.db
      .select({
        userId: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
        firstEntryDate: min(firstEntries.date),
      })
      .from(users)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, users.roleId))
      .innerJoin(permissions, and(eq(permissions.id, rolePermissions.permissionId), eq(permissions.code, 'hours:register')))
      .leftJoin(firstEntries, eq(firstEntries.userId, users.id))
      .where(isActiveUser)
      .groupBy(users.id);

    return rows.map((row) => ({
      ...toRecipient(row),
      firstEntryDate: row.firstEntryDate ? toIsoDate(row.firstEntryDate) : null,
    }));
  }

  async findFirstEntryDate(userId: string): Promise<string | null> {
    const firstEntries = this.db
      .select({ date: hourEntries.date })
      .from(hourEntries)
      .where(eq(hourEntries.userId, userId))
      .unionAll(this.db.select({ date: ticketHhRequests.date }).from(ticketHhRequests).where(eq(ticketHhRequests.userId, userId)))
      .as('first_entries');
    const rows = await this.db.select({ date: min(firstEntries.date) }).from(firstEntries);
    return rows[0]?.date ? toIsoDate(rows[0].date) : null;
  }

  async sumDailyHours(userIds: readonly string[], from: string, to: string): Promise<DailyHours[]> {
    if (userIds.length === 0) return [];
    const range = { from: new Date(`${from}T00:00:00Z`), to: new Date(`${to}T00:00:00Z`) };

    const entries = this.db
      .select({ userId: hourEntries.userId, date: hourEntries.date, hours: hourEntries.hours })
      .from(hourEntries)
      .where(and(inArray(hourEntries.userId, [...userIds]), between(hourEntries.date, range.from, range.to)))
      .unionAll(
        this.db
          .select({ userId: ticketHhRequests.userId, date: ticketHhRequests.date, hours: ticketHhRequests.hours })
          .from(ticketHhRequests)
          .where(
            and(
              isNull(ticketHhRequests.hourEntryId),
              inArray(ticketHhRequests.userId, [...userIds]),
              between(ticketHhRequests.date, range.from, range.to),
            ),
          ),
      )
      .as('entries');

    const rows = await this.db
      .select({ userId: entries.userId, date: entries.date, hours: sql<string>`sum(${entries.hours})` })
      .from(entries)
      .groupBy(entries.userId, entries.date);

    return rows.map((row) => ({ userId: row.userId, date: toIsoDate(row.date), hours: Number(row.hours) }));
  }

  async findHolidays(from: string, to: string): Promise<string[]> {
    // Mismo filtro que el formulario de horas: feriado nacional (sin región) y no laborable.
    const rows = await this.db
      .select({ date: holidays.date })
      .from(holidays)
      .where(
        and(
          eq(holidays.countryCode, 'CL'),
          eq(holidays.regionCode, ''),
          eq(holidays.isWorkingDay, false),
          between(holidays.date, new Date(`${from}T00:00:00Z`), new Date(`${to}T00:00:00Z`)),
        ),
      );
    return rows.map((row) => toIsoDate(row.date));
  }

  async findPendingHourEntries(): Promise<PendingHourEntryRow[]> {
    const rows = await this.db
      .select({
        id: hourEntries.id,
        ownerUserId: hourEntries.userId,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
        projectId: hourEntries.projectId,
        projectName: projects.name,
        assignment: hourEntries.assignment,
        designatedApproverUserId: hourEntries.designatedApproverUserId,
        ticketCode: tickets.legacyId,
        ticketDeletedAt: tickets.deletedAt,
        ticketId: tickets.id,
        date: hourEntries.date,
        hours: hourEntries.hours,
        createdAt: hourEntries.createdAt,
      })
      .from(hourEntries)
      .innerJoin(users, eq(users.id, hourEntries.userId))
      .leftJoin(projects, eq(projects.id, hourEntries.projectId))
      .leftJoin(ticketHhRequests, eq(ticketHhRequests.hourEntryId, hourEntries.id))
      .leftJoin(tickets, eq(tickets.id, ticketHhRequests.ticketId))
      .where(and(eq(hourEntries.status, 'pending'), isActiveUser));

    return (
      rows
        // El borrado lógico de un ticket no limpia sus HH pendientes: no tiene sentido pedir aprobarlas.
        .filter((row) => !row.ticketDeletedAt)
        .map((row) => ({
          id: row.id,
          ownerUserId: row.ownerUserId,
          ownerFullName: `${row.ownerFirstName} ${row.ownerLastName}`.trim(),
          projectId: row.projectId,
          projectName: row.projectName,
          assignment: row.assignment,
          designatedApproverUserId: row.designatedApproverUserId,
          ticketCode: row.ticketId ? (row.ticketCode ?? 'Ticket') : null,
          date: toIsoDate(row.date),
          hours: Number(row.hours),
          createdAt: row.createdAt,
        }))
    );
  }

  async findTeamLeaderIdsForMember(memberUserId: string): Promise<string[]> {
    // Ver `DrizzleTeamRepository.leadsTeamCondition`: "liderar" un equipo es
    // ser su líder oficial o liderar un proyecto asignado a ese equipo.
    // Que el líder siga activo lo filtra después `findActiveUsersByIds`.
    const rows = await this.db
      .select({ teamLeaderUserId: teams.leaderUserId, projectTeamLeaderUserId: projectTeams.leaderUserId })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .leftJoin(projectTeams, eq(projectTeams.teamId, teams.id))
      .where(and(eq(teamMembers.userId, memberUserId), isNull(teamMembers.leftAt), isNull(teams.deletedAt)));

    const ids = new Set<string>();
    for (const row of rows) {
      if (row.teamLeaderUserId) ids.add(row.teamLeaderUserId);
      if (row.projectTeamLeaderUserId) ids.add(row.projectTeamLeaderUserId);
    }
    return [...ids];
  }

  async findActiveUsersByIds(userIds: readonly string[]): Promise<ReminderRecipient[]> {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select({ userId: users.id, email: users.email, firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(and(inArray(users.id, [...userIds]), isActiveUser));
    return rows.map(toRecipient);
  }
}

function toRecipient(row: { userId: string; email: string; firstName: string; lastName: string }): ReminderRecipient {
  return {
    userId: row.userId,
    email: row.email,
    firstName: row.firstName,
    fullName: `${row.firstName} ${row.lastName}`.trim(),
  };
}

/** Las columnas `date` llegan como `Date` a medianoche UTC. */
function toIsoDate(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}
