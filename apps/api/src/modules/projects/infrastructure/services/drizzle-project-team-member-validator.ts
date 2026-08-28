import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, teamMembers, type Database } from '@kora/db';
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
}
