import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, teamMembers, users, type Database } from '@kora/db';
import type { ProjectTeamMemberValidator } from '../../application/ports/project-team-member-validator.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

@Injectable()
export class DrizzleProjectTeamMemberValidator implements ProjectTeamMemberValidator {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async isActiveTeamMember(teamMemberId: string): Promise<boolean> {
    const rows = await this.database
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(and(eq(teamMembers.id, teamMemberId), isNull(teamMembers.leftAt)))
      .limit(1);
    return rows.length > 0;
  }

  async findTeamId(teamMemberId: string): Promise<string | null> {
    const rows = await this.database
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.id, teamMemberId))
      .limit(1);
    return rows[0]?.teamId ?? null;
  }

  async isUserDisabled(teamMemberId: string): Promise<boolean> {
    const rows = await this.database
      .select({ status: users.status })
      .from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(eq(teamMembers.id, teamMemberId))
      .limit(1);
    return rows[0]?.status === 'disabled';
  }
}
