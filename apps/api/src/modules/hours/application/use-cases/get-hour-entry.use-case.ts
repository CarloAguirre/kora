import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type ApplicationError, type Result } from '@kora/core';
import type { HourEntryDetail } from '@kora/contracts';
import { HourEntryNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_USER_READER, type HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { HOUR_ENTRY_TEAM_READER, type HourEntryTeamReader } from '../ports/hour-entry-team-reader.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { toHourEntryDetail } from '../mappers/hour-entry.mapper';

export interface GetHourEntryCommand {
  readonly entryId: string;
}

@Injectable()
export class GetHourEntryUseCase implements UseCase<GetHourEntryCommand, HourEntryDetail, ApplicationError> {
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(HOUR_ENTRY_USER_READER) private readonly users: HourEntryUserReader,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
    @Inject(HOUR_ENTRY_TEAM_READER) private readonly teams: HourEntryTeamReader,
  ) {}

  async execute(command: GetHourEntryCommand): Promise<Result<HourEntryDetail, ApplicationError>> {
    const entry = await this.entries.findById(command.entryId);
    if (!entry) return err(new HourEntryNotFoundError(command.entryId));

    const snapshot = entry.toSnapshot();
    const [owner, project, designatedApprover, decisionBy, team] = await Promise.all([
      this.users.findById(snapshot.userId),
      snapshot.projectId ? this.projects.findById(snapshot.projectId) : Promise.resolve(null),
      snapshot.designatedApproverUserId ? this.users.findById(snapshot.designatedApproverUserId) : Promise.resolve(null),
      snapshot.decisionUserId ? this.users.findById(snapshot.decisionUserId) : Promise.resolve(null),
      this.teams.findTeamForUser(snapshot.userId),
    ]);

    return ok(toHourEntryDetail({ entry, owner, project, designatedApprover, decisionBy, team }));
  }
}
