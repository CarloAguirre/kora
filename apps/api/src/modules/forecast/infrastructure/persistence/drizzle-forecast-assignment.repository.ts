import { Inject, Injectable } from '@nestjs/common';
import {
  alias,
  and,
  clients,
  eq,
  forecastAssignments,
  gte,
  lte,
  projectModuleSegments,
  projectModuleTasks,
  projectModules,
  projects,
  teamMembers,
  teams,
  users,
  type Database,
} from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  ForecastAssignmentRawRow,
  ForecastAssignmentRecord,
  ForecastAssignmentRepository,
} from '../../domain/repositories/forecast-assignment.repository';
import type { ForecastAssignment } from '../../domain/entities/forecast-assignment.entity';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './forecast-assignment.persistence-mapper';

@Injectable()
export class DrizzleForecastAssignmentRepository implements ForecastAssignmentRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findById(id: string, context?: TransactionContext): Promise<ForecastAssignment | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(forecastAssignments).where(eq(forecastAssignments.id, id)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async findByLegacyId(legacyId: number, context?: TransactionContext): Promise<ForecastAssignment | null> {
    const db = resolveDb(this.database, context);
    const rows = await db.select().from(forecastAssignments).where(eq(forecastAssignments.legacyId, legacyId)).limit(1);
    return rows[0] ? toDomain(rows[0]) : null;
  }

  async listForTeamAndPeriod(
    teamId: string,
    periodStart: Date,
    periodEnd: Date,
    context?: TransactionContext,
  ): Promise<ForecastAssignmentRecord[]> {
    const db = resolveDb(this.database, context);
    const taskModules = alias(projectModules, 'task_modules');
    const adjusters = alias(users, 'adjusters');
    const rows = await db
      .select({
        id: forecastAssignments.id,
        teamMemberId: forecastAssignments.teamMemberId,
        memberFirstName: users.firstName,
        memberLastName: users.lastName,
        teamId: teamMembers.teamId,
        teamName: teams.name,
        periodStart: forecastAssignments.periodStart,
        periodEnd: forecastAssignments.periodEnd,
        type: forecastAssignments.type,
        projectId: forecastAssignments.projectId,
        projectName: projects.name,
        clientId: forecastAssignments.clientId,
        clientName: clients.companyName,
        comments: forecastAssignments.comments,
        assignedHours: forecastAssignments.assignedHours,
        source: forecastAssignments.source,
        segmentId: forecastAssignments.segmentId,
        segmentName: projectModuleSegments.name,
        segmentModuleName: projectModules.name,
        taskId: forecastAssignments.taskId,
        taskName: projectModuleTasks.name,
        taskModuleName: taskModules.name,
        calculatedHours: forecastAssignments.calculatedHours,
        adjustedAt: forecastAssignments.adjustedAt,
        adjusterFirstName: adjusters.firstName,
        adjusterLastName: adjusters.lastName,
        isStale: forecastAssignments.isStale,
        createdAt: forecastAssignments.createdAt,
        updatedAt: forecastAssignments.updatedAt,
      })
      .from(forecastAssignments)
      .innerJoin(teamMembers, eq(teamMembers.id, forecastAssignments.teamMemberId))
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .leftJoin(users, eq(users.id, teamMembers.userId))
      .leftJoin(projects, eq(projects.id, forecastAssignments.projectId))
      .leftJoin(clients, eq(clients.id, forecastAssignments.clientId))
      .leftJoin(projectModuleSegments, eq(projectModuleSegments.id, forecastAssignments.segmentId))
      .leftJoin(projectModules, eq(projectModules.id, projectModuleSegments.moduleId))
      .leftJoin(projectModuleTasks, eq(projectModuleTasks.id, forecastAssignments.taskId))
      .leftJoin(taskModules, eq(taskModules.id, projectModuleTasks.moduleId))
      .leftJoin(adjusters, eq(adjusters.id, forecastAssignments.adjustedByUserId))
      .where(
        and(
          eq(teamMembers.teamId, teamId),
          eq(forecastAssignments.periodStart, periodStart),
          eq(forecastAssignments.periodEnd, periodEnd),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      teamMemberId: row.teamMemberId,
      memberFullName: row.memberFirstName ? `${row.memberFirstName} ${row.memberLastName ?? ''}`.trim() : '',
      teamId: row.teamId,
      teamName: row.teamName,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      type: row.type,
      projectId: row.projectId,
      projectName: row.projectName,
      clientId: row.clientId,
      clientName: row.clientName,
      comments: row.comments,
      assignedHours: Number(row.assignedHours),
      source: row.source,
      segmentId: row.segmentId,
      segmentName: row.segmentName,
      segmentModuleName: row.segmentModuleName,
      taskId: row.taskId,
      taskName: row.taskName,
      taskModuleName: row.taskModuleName,
      calculatedHours: row.calculatedHours != null ? Number(row.calculatedHours) : null,
      adjustedAt: row.adjustedAt,
      adjustedByName: row.adjusterFirstName ? `${row.adjusterFirstName} ${row.adjusterLastName ?? ''}`.trim() : null,
      isStale: row.isStale,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listRawForWeeks(firstMonday: Date, lastMonday: Date, context?: TransactionContext): Promise<ForecastAssignmentRawRow[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        teamMemberId: forecastAssignments.teamMemberId,
        periodStart: forecastAssignments.periodStart,
        type: forecastAssignments.type,
        projectId: forecastAssignments.projectId,
        projectName: projects.name,
        comments: forecastAssignments.comments,
        assignedHours: forecastAssignments.assignedHours,
        source: forecastAssignments.source,
        segmentId: forecastAssignments.segmentId,
        taskId: forecastAssignments.taskId,
        adjustedAt: forecastAssignments.adjustedAt,
        isStale: forecastAssignments.isStale,
      })
      .from(forecastAssignments)
      .leftJoin(projects, eq(projects.id, forecastAssignments.projectId))
      .where(and(gte(forecastAssignments.periodStart, firstMonday), lte(forecastAssignments.periodStart, lastMonday)));

    return rows.map((row) => ({
      teamMemberId: row.teamMemberId,
      periodStart: row.periodStart,
      type: row.type,
      projectId: row.projectId,
      projectName: row.projectName,
      comments: row.comments,
      assignedHours: Number(row.assignedHours),
      source: row.source,
      segmentId: row.segmentId,
      taskId: row.taskId,
      isAdjusted: row.adjustedAt !== null,
      isStale: row.isStale,
    }));
  }

  async save(assignment: ForecastAssignment, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(assignment);

    await db
      .insert(forecastAssignments)
      .values({ id: assignment.id, ...values })
      .onConflictDoUpdate({ target: forecastAssignments.id, set: values });
  }

  async delete(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(forecastAssignments).where(eq(forecastAssignments.id, id));
  }
}
