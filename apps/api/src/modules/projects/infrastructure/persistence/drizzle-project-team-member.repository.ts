import { Inject, Injectable } from '@nestjs/common';
import { eq, and, projectTeamMembers, teamMembers, teams, users, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type {
  AssignProjectTeamMemberRecord,
  ProjectTeamMemberRecord,
  ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleProjectTeamMemberRepository implements ProjectTeamMemberRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listForProject(
    projectId: string,
    context?: TransactionContext,
  ): Promise<ProjectTeamMemberRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await this.baseQuery(db).where(eq(projectTeamMembers.projectId, projectId));
    return rows.map(this.toRecord);
  }

  async findById(id: string, context?: TransactionContext): Promise<ProjectTeamMemberRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await this.baseQuery(db).where(eq(projectTeamMembers.id, id)).limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async findByProjectAndTeamMember(
    projectId: string,
    teamMemberId: string,
    context?: TransactionContext,
  ): Promise<ProjectTeamMemberRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await this.baseQuery(db)
      .where(and(eq(projectTeamMembers.projectId, projectId), eq(projectTeamMembers.teamMemberId, teamMemberId)))
      .limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async assign(record: AssignProjectTeamMemberRecord, context?: TransactionContext): Promise<string> {
    const db = resolveDb(this.database, context);

    const membership = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.id, record.teamMemberId))
      .limit(1);
    const teamId = membership[0]?.teamId;
    if (!teamId) throw new Error(`El miembro de equipo ${record.teamMemberId} no existe.`);

    const inserted = await db
      .insert(projectTeamMembers)
      .values({
        projectId: record.projectId,
        teamId,
        teamMemberId: record.teamMemberId,
        activity: record.activity,
        assignedHours: String(record.assignedHours),
      })
      .returning({ id: projectTeamMembers.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('La asignación no devolvió identificador.');
    return id;
  }

  async unassign(id: string, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.delete(projectTeamMembers).where(eq(projectTeamMembers.id, id));
  }

  private baseQuery(db: Database) {
    return db
      .select({
        id: projectTeamMembers.id,
        projectId: projectTeamMembers.projectId,
        teamId: projectTeamMembers.teamId,
        teamName: teams.name,
        teamMemberId: projectTeamMembers.teamMemberId,
        userId: teamMembers.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        activity: projectTeamMembers.activity,
        assignedHours: projectTeamMembers.assignedHours,
        consumedHours: projectTeamMembers.consumedHours,
      })
      .from(projectTeamMembers)
      .innerJoin(teams, eq(teams.id, projectTeamMembers.teamId))
      .innerJoin(teamMembers, eq(teamMembers.id, projectTeamMembers.teamMemberId))
      .innerJoin(users, eq(users.id, teamMembers.userId));
  }

  private toRecord(row: {
    id: string;
    projectId: string;
    teamId: string;
    teamName: string;
    teamMemberId: string;
    userId: string;
    userFirstName: string;
    userLastName: string;
    activity: string | null;
    assignedHours: string;
    consumedHours: string;
  }): ProjectTeamMemberRecord {
    return {
      id: row.id,
      projectId: row.projectId,
      teamId: row.teamId,
      teamName: row.teamName,
      teamMemberId: row.teamMemberId,
      userId: row.userId,
      fullName: `${row.userFirstName} ${row.userLastName}`.trim(),
      activity: row.activity,
      assignedHours: Number(row.assignedHours),
      consumedHours: Number(row.consumedHours),
    };
  }
}
