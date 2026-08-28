import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  clients,
  eq,
  forecastAssignments,
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
        createdAt: forecastAssignments.createdAt,
        updatedAt: forecastAssignments.updatedAt,
      })
      .from(forecastAssignments)
      .innerJoin(teamMembers, eq(teamMembers.id, forecastAssignments.teamMemberId))
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .leftJoin(users, eq(users.id, teamMembers.userId))
      .leftJoin(projects, eq(projects.id, forecastAssignments.projectId))
      .leftJoin(clients, eq(clients.id, forecastAssignments.clientId))
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
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  }

  async listRawForPeriod(periodStart: Date, periodEnd: Date, context?: TransactionContext): Promise<ForecastAssignmentRawRow[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        teamMemberId: forecastAssignments.teamMemberId,
        type: forecastAssignments.type,
        projectId: forecastAssignments.projectId,
        projectName: projects.name,
        comments: forecastAssignments.comments,
        assignedHours: forecastAssignments.assignedHours,
      })
      .from(forecastAssignments)
      .leftJoin(projects, eq(projects.id, forecastAssignments.projectId))
      .where(
        and(
          eq(forecastAssignments.periodStart, periodStart),
          eq(forecastAssignments.periodEnd, periodEnd),
        ),
      );

    return rows.map((row) => ({
      teamMemberId: row.teamMemberId,
      type: row.type,
      projectId: row.projectId,
      projectName: row.projectName,
      comments: row.comments,
      assignedHours: Number(row.assignedHours),
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
