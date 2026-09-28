import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { CorrectProjectHito0DateInput } from '@kora/contracts';
import { ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_OBSERVATION_REPOSITORY,
  type ProjectObservationRepository,
} from '../../domain/repositories/project-observation.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CorrectProjectHito0DateCommand {
  readonly projectId: string;
  readonly data: CorrectProjectHito0DateInput;
  readonly actor: ActorContext;
}

/**
 * Gerencia/PMO corrige la fecha del Hito 0 ya registrado — no reabre ni cambia el estado del proyecto.
 * Se hace desde el registro de activación en la bitácora (`isHito0`), cuya fecha se mantiene alineada.
 */
@Injectable()
export class CorrectProjectHito0DateUseCase
  implements UseCase<CorrectProjectHito0DateCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_OBSERVATION_REPOSITORY) private readonly observations: ProjectObservationRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: CorrectProjectHito0DateCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const previousHito0At = project.hito0At;
    const date = new Date(command.data.date);
    const now = this.clock.now();
    project.correctHito0Date(date, now);
    await this.projects.save(project);
    await this.observations.updateHito0Date(project.id, date, now);

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      changes: { hito0At: { before: previousHito0At?.toISOString() ?? null, after: date.toISOString() } },
    });

    return ok(undefined);
  }
}
