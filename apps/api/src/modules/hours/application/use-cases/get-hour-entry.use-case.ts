import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, ok, type ApplicationError, type Result } from '@kora/core';
import type { HourEntryDetail, Permission } from '@kora/contracts';
import { HourEntryNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_USER_READER, type HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import { HOUR_ENTRY_TEAM_READER, type HourEntryTeamReader } from '../ports/hour-entry-team-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { toHourEntryDetail } from '../mappers/hour-entry.mapper';

export interface GetHourEntryCommand {
  readonly entryId: string;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Mismo alcance de visibilidad que `ListHourEntriesUseCase` — sin él, cualquier
 * persona con `hours:read_own` (casi todo el que registra horas) podía leer el
 * registro de CUALQUIER otro usuario por id, porque el detalle no repetía la
 * verificación que sí hace el listado.
 */
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

    if (!command.actorPermissions.includes('hours:read_all') && snapshot.userId !== command.actor.userId) {
      // Con proyecto: EXCLUYENTE, mismo criterio que decide si puede
      // aprobarlo — liderar "el mismo equipo en OTRO proyecto" no da acceso
      // (ver `ListHourEntriesUseCase`/DECISION-M4-HORAS.md "Cuarta
      // corrección"). Sin proyecto: sigue siendo "lidera al dueño en
      // general", porque no hay proyecto que acote.
      const canReadAsTeamLead =
        command.actorPermissions.includes('hours:read_team') &&
        (snapshot.projectId
          ? await this.projects.isProjectApprover(snapshot.projectId, command.actor.userId, snapshot.userId)
          : await this.teams.isTeamLeaderOfMember(command.actor.userId, snapshot.userId));
      if (!canReadAsTeamLead) {
        return err(new ForbiddenError('No tienes acceso a este registro de horas.', 'HOUR_ENTRY_NOT_ASSIGNED'));
      }
    }

    const [owner, project, designatedApprover, decisionBy, team, projectApprovers] = await Promise.all([
      this.users.findById(snapshot.userId),
      snapshot.projectId ? this.projects.findById(snapshot.projectId) : Promise.resolve(null),
      snapshot.designatedApproverUserId ? this.users.findById(snapshot.designatedApproverUserId) : Promise.resolve(null),
      snapshot.decisionUserId ? this.users.findById(snapshot.decisionUserId) : Promise.resolve(null),
      this.teams.findTeamForUser(snapshot.userId),
      snapshot.projectId ? this.projects.findApprovers(snapshot.projectId, snapshot.userId) : Promise.resolve([]),
    ]);

    return ok(toHourEntryDetail({ entry, owner, project, designatedApprover, decisionBy, team, projectApprovers }));
  }
}
