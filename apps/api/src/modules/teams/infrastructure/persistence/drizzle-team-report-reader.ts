import { Inject, Injectable } from '@nestjs/common';
import {
  alias,
  and,
  asc,
  clients,
  eq,
  gte,
  hourEntries,
  inArray,
  isNull,
  lte,
  ne,
  projectModuleDeliveries,
  projectModules,
  projectModuleTasks,
  projects,
  projectTeams,
  sql,
  teamMembers,
  users,
  type Database,
} from '@kora/db';
import type {
  TeamReportHoursRow,
  TeamReportPerson,
  TeamReportProjectRow,
  TeamReportReader,
  TeamReportTaskRow,
} from '../../application/ports/team-report-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

const toIsoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const fullName = (firstName: string | null, lastName: string | null) => `${firstName ?? ''} ${lastName ?? ''}`.trim();

@Injectable()
export class DrizzleTeamReportReader implements TeamReportReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listPeople(teamId: string, leaderUserId: string | null): Promise<TeamReportPerson[]> {
    const rows = await this.database
      .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)));

    const people = rows.map((row) => ({ id: row.id, fullName: fullName(row.firstName, row.lastName) }));
    if (leaderUserId && !people.some((person) => person.id === leaderUserId)) {
      const leader = await this.database
        .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
        .from(users)
        .where(eq(users.id, leaderUserId))
        .limit(1);
      if (leader[0]) people.push({ id: leader[0].id, fullName: fullName(leader[0].firstName, leader[0].lastName) });
    }
    return people.sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }

  async listProjects(teamId: string): Promise<TeamReportProjectRow[]> {
    const responsible = alias(users, 'responsible');
    const projectLeader = alias(users, 'project_leader');
    const rows = await this.database
      .select({
        projectId: projects.id,
        name: projects.name,
        slug: projects.slug,
        clientId: clients.id,
        clientName: clients.companyName,
        status: projects.status,
        salesStage: projects.salesStage,
        startDate: projects.startDate,
        endDate: projects.endDate,
        assignedHours: projectTeams.assignedHours,
        responsibleId: responsible.id,
        responsibleFirstName: responsible.firstName,
        responsibleLastName: responsible.lastName,
        leaderId: projectLeader.id,
        leaderFirstName: projectLeader.firstName,
        leaderLastName: projectLeader.lastName,
        comment: projectTeams.reportComment,
        dataRequestedAt: projectTeams.dataRequestedAt,
      })
      .from(projectTeams)
      .innerJoin(projects, eq(projects.id, projectTeams.projectId))
      .leftJoin(clients, eq(clients.id, projects.clientId))
      .leftJoin(responsible, eq(responsible.id, projectTeams.leaderUserId))
      .leftJoin(projectLeader, eq(projectLeader.id, projects.leaderUserId))
      .where(and(eq(projectTeams.teamId, teamId), isNull(projects.deletedAt), ne(projects.status, 'cancelled')))
      .orderBy(sql`${clients.companyName} asc nulls last`, asc(projects.name));

    return rows.map((row) => ({
      projectId: row.projectId,
      name: row.name,
      slug: row.slug,
      client: row.clientId && row.clientName ? { id: row.clientId, companyName: row.clientName } : null,
      status: row.status,
      salesStage: row.salesStage,
      startDate: toIsoDate(row.startDate),
      endDate: toIsoDate(row.endDate),
      assignedHours: row.assignedHours === null ? null : Number(row.assignedHours),
      responsible: row.responsibleId
        ? { id: row.responsibleId, fullName: fullName(row.responsibleFirstName, row.responsibleLastName) }
        : null,
      projectLeader: row.leaderId ? { id: row.leaderId, fullName: fullName(row.leaderFirstName, row.leaderLastName) } : null,
      comment: row.comment,
      dataRequestedAt: row.dataRequestedAt?.toISOString() ?? null,
    }));
  }

  async sumHours(projectIds: string[], userIds: string[], dateFrom: Date, dateTo: Date): Promise<TeamReportHoursRow[]> {
    if (projectIds.length === 0 || userIds.length === 0) return [];
    // `gte` sobre la columna (no un `Date` crudo en `sql`) para que Drizzle serialice la fecha como `date`.
    const inPeriod = gte(hourEntries.date, dateFrom);
    const rows = await this.database
      .select({
        projectId: hourEntries.projectId,
        userId: hourEntries.userId,
        periodApproved: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'approved' and ${inPeriod}), 0)`,
        periodPending: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'pending' and ${inPeriod}), 0)`,
        accumulatedApproved: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'approved'), 0)`,
        accumulatedPending: sql<string>`coalesce(sum(${hourEntries.hours}) filter (where ${hourEntries.status} = 'pending'), 0)`,
      })
      .from(hourEntries)
      .where(
        and(
          inArray(hourEntries.projectId, projectIds),
          inArray(hourEntries.userId, userIds),
          inArray(hourEntries.status, ['approved', 'pending']),
          lte(hourEntries.date, dateTo),
        ),
      )
      .groupBy(hourEntries.projectId, hourEntries.userId);

    return rows.map((row) => ({
      projectId: row.projectId!,
      userId: row.userId,
      periodApproved: Number(row.periodApproved),
      periodPending: Number(row.periodPending),
      accumulatedApproved: Number(row.accumulatedApproved),
      accumulatedPending: Number(row.accumulatedPending),
    }));
  }

  async listTeamTasks(teamId: string, projectIds: string[]): Promise<TeamReportTaskRow[]> {
    if (projectIds.length === 0) return [];
    const rows = await this.database
      .select({
        projectId: projectModules.projectId,
        total: sql<number>`count(*)::int`,
        approved: sql<number>`(count(*) filter (where ${projectModuleTasks.status} = 'done'))::int`,
      })
      .from(projectModuleTasks)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleTasks.moduleId))
      .where(and(eq(projectModuleTasks.teamId, teamId), inArray(projectModules.projectId, projectIds)))
      .groupBy(projectModules.projectId);
    return rows.map((row) => ({ projectId: row.projectId, total: Number(row.total), approved: Number(row.approved) }));
  }

  async listProjectsWithApprovedDelivery(teamId: string, projectIds: string[]): Promise<Set<string>> {
    if (projectIds.length === 0) return new Set();
    const rows = await this.database
      .selectDistinct({ projectId: projectModules.projectId })
      .from(projectModuleDeliveries)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
      .where(
        and(
          eq(projectModuleDeliveries.teamId, teamId),
          eq(projectModuleDeliveries.status, 'approved'),
          inArray(projectModules.projectId, projectIds),
        ),
      );
    return new Set(rows.map((row) => row.projectId));
  }

  async updateComment(teamId: string, projectId: string, comment: string | null): Promise<boolean> {
    const rows = await this.database
      .update(projectTeams)
      .set({ reportComment: comment, updatedAt: new Date() })
      .where(and(eq(projectTeams.teamId, teamId), eq(projectTeams.projectId, projectId)))
      .returning({ id: projectTeams.id });
    return rows.length > 0;
  }

  async markDataRequested(teamId: string, projectIds: string[], requestedAt: Date): Promise<void> {
    if (projectIds.length === 0) return;
    await this.database
      .update(projectTeams)
      .set({ dataRequestedAt: requestedAt, updatedAt: requestedAt })
      .where(and(eq(projectTeams.teamId, teamId), inArray(projectTeams.projectId, projectIds)));
  }
}
