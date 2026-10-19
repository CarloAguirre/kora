import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, roles, teamMembers, teams, users, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type { RoleCode, UserStatus } from '@kora/contracts';
import type {
  AddTeamMemberRecord,
  TeamMemberRecord,
  TeamMemberRecordWithTeam,
  TeamMemberRepository,
} from '../../domain/repositories/team-member.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleTeamMemberRepository implements TeamMemberRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async listActiveForTeam(
    teamId: string,
    context?: TransactionContext,
  ): Promise<TeamMemberRecord[]> {
    const db = resolveDb(this.database, context);
    const rows = await this.baseQuery(db).where(
      and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)),
    );
    return rows.map(this.toRecord);
  }

  async listAllActive(context?: TransactionContext): Promise<TeamMemberRecordWithTeam[]> {
    const db = resolveDb(this.database, context);
    const rows = await db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        teamName: teams.name,
        userId: teamMembers.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        userStatus: users.status,
        userRole: roles.code,
        position: teamMembers.position,
        weeklyHours: teamMembers.weeklyHours,
        joinedAt: teamMembers.joinedAt,
        leftAt: teamMembers.leftAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .innerJoin(roles, eq(roles.id, users.roleId))
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(isNull(teamMembers.leftAt));

    return rows.map((row) => ({ ...this.toRecord(row), teamName: row.teamName }));
  }

  async findActiveById(id: string, context?: TransactionContext): Promise<TeamMemberRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await this.baseQuery(db).where(and(eq(teamMembers.id, id), isNull(teamMembers.leftAt))).limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async findActiveByUserAndTeam(
    userId: string,
    teamId: string,
    context?: TransactionContext,
  ): Promise<TeamMemberRecord | null> {
    const db = resolveDb(this.database, context);
    const rows = await this.baseQuery(db)
      .where(and(eq(teamMembers.userId, userId), eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)))
      .limit(1);
    return rows[0] ? this.toRecord(rows[0]) : null;
  }

  async add(record: AddTeamMemberRecord, context?: TransactionContext): Promise<string> {
    const db = resolveDb(this.database, context);
    const inserted = await db
      .insert(teamMembers)
      .values({
        teamId: record.teamId,
        userId: record.userId,
        position: record.position,
        weeklyHours: String(record.weeklyHours),
        joinedAt: record.joinedAt,
      })
      .returning({ id: teamMembers.id });

    const id = inserted[0]?.id;
    if (!id) throw new Error('La inserción del miembro no devolvió identificador.');
    return id;
  }

  async updateDetails(
    id: string,
    data: { position?: string | null; weeklyHours?: number },
    context?: TransactionContext,
  ): Promise<void> {
    const db = resolveDb(this.database, context);
    await db
      .update(teamMembers)
      .set({
        ...(data.position !== undefined ? { position: data.position } : {}),
        ...(data.weeklyHours !== undefined ? { weeklyHours: String(data.weeklyHours) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(teamMembers.id, id));
  }

  async remove(id: string, at: Date, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    await db.update(teamMembers).set({ leftAt: at, updatedAt: at }).where(eq(teamMembers.id, id));
  }

  private baseQuery(db: Database) {
    return db
      .select({
        id: teamMembers.id,
        teamId: teamMembers.teamId,
        userId: teamMembers.userId,
        userFirstName: users.firstName,
        userLastName: users.lastName,
        userEmail: users.email,
        userStatus: users.status,
        userRole: roles.code,
        position: teamMembers.position,
        weeklyHours: teamMembers.weeklyHours,
        joinedAt: teamMembers.joinedAt,
        leftAt: teamMembers.leftAt,
      })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .innerJoin(roles, eq(roles.id, users.roleId));
  }

  private toRecord(row: {
    id: string;
    teamId: string;
    userId: string;
    userFirstName: string;
    userLastName: string;
    userEmail: string;
    userStatus: UserStatus;
    userRole: string;
    position: string | null;
    weeklyHours: string;
    joinedAt: Date;
    leftAt: Date | null;
  }): TeamMemberRecord {
    return {
      id: row.id,
      teamId: row.teamId,
      userId: row.userId,
      userFullName: `${row.userFirstName} ${row.userLastName}`.trim(),
      userEmail: row.userEmail,
      userStatus: row.userStatus,
      userRole: row.userRole as RoleCode,
      position: row.position,
      weeklyHours: Number(row.weeklyHours),
      joinedAt: row.joinedAt,
      leftAt: row.leftAt,
    };
  }
}
