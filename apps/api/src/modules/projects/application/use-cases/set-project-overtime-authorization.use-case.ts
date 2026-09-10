import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission } from '@kora/contracts';
import { CannotAuthorizeProjectOvertimeError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface SetProjectOvertimeAuthorizationCommand {
  readonly projectId: string;
  readonly allowsOvertime: boolean;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Autorizar que un proyecto admita horas extra es una decisión de líder —
 * mismo criterio EXCLUYENTE que el resto del sistema (líder de proyecto o
 * líder del equipo asignado a él, ver `isProjectLeaderOrTeamLeaderOfMember`),
 * no solo `projects:manage`. Vive en su propio endpoint/caso de uso porque
 * `PATCH /projects/:id` (`UpdateProjectUseCase`) exige `projects:manage` a
 * nivel de decorador — un líder sin ese permiso no llegaría a tocar el resto
 * de los campos del proyecto, que sí deben quedar restringidos a `projects:manage`.
 */
@Injectable()
export class SetProjectOvertimeAuthorizationUseCase
  implements UseCase<SetProjectOvertimeAuthorizationCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: SetProjectOvertimeAuthorizationCommand): Promise<Result<void, ApplicationError>> {
    const { projectId, allowsOvertime, actor } = command;
    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(projectId));

    if (!command.actorPermissions.includes('projects:manage')) {
      const isApprover = await this.projects.isProjectLeaderOrTeamLeaderOfMember(projectId, actor.userId, null);
      if (!isApprover) return err(new CannotAuthorizeProjectOvertimeError());
    }

    const before = project.allowsOvertime;
    const updated = project.updateDetails({ allowsOvertime }, this.clock.now());
    if (updated.isErr()) return err(updated.error);

    await this.projects.save(project);

    if (before !== allowsOvertime) {
      await this.audit.record({
        actor: { userId: actor.userId, email: actor.email },
        action: 'update',
        entityType: 'project',
        entityId: project.id,
        changes: { allowsOvertime: { before, after: allowsOvertime } },
      });
    }

    return ok(undefined);
  }
}
