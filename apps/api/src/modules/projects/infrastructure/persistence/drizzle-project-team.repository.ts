import { Inject, Injectable } from '@nestjs/common';
import { projectTeams, type Database } from '@kora/db';
import type { TransactionContext } from '@kora/core';
import type { ProjectTeamRepository, UpsertProjectTeamInput } from '../../domain/repositories/project-team.repository';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';

@Injectable()
export class DrizzleProjectTeamRepository implements ProjectTeamRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async save(input: UpsertProjectTeamInput, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = {
      projectId: input.projectId,
      teamId: input.teamId,
      leaderUserId: input.leaderUserId,
      memberCount: input.memberCount,
      assignedHours: input.assignedHours != null ? String(input.assignedHours) : null,
    };

    await db
      .insert(projectTeams)
      .values(values)
      .onConflictDoUpdate({ target: [projectTeams.projectId, projectTeams.teamId], set: values });
  }
}
