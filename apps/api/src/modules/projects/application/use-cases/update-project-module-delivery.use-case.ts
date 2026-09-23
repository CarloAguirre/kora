import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, UpdateProjectModuleDeliveryInput } from '@kora/contracts';
import {
  ProjectModuleDeliveryNotFoundError,
  ProjectModuleNotFoundError,
  ProjectNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import {
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectModuleDeliveryCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly deliveryId: string;
  readonly data: UpdateProjectModuleDeliveryInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Además del líder (`projects:manage` o `project.leaderUserId`), cualquier
 * participante del proyecto (developer, comercial o miembro de equipo
 * asignado — mismo criterio que `AddProjectObservationUseCase`) puede marcar
 * una entrega como entregada; aprobarla, rechazarla, reasignarle el equipo o
 * mover su fecha estimada requiere ser quien administra el proyecto (líder
 * de proyecto, PMO o admin).
 */
@Injectable()
export class UpdateProjectModuleDeliveryUseCase
  implements UseCase<UpdateProjectModuleDeliveryCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly members: ProjectTeamMemberRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectModuleDeliveryCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    if (!module.deliveries.some((delivery) => delivery.id === command.deliveryId)) {
      return err(new ProjectModuleDeliveryNotFoundError(command.deliveryId));
    }

    const snapshot = project.toSnapshot();
    const canManage =
      command.actorPermissions.includes('projects:manage') || snapshot.leaderUserId === command.actor.userId;
    if (!canManage) {
      if (command.data.teamId !== undefined) {
        return err(
          new ForbiddenError('Solo quien administra el proyecto puede reasignar el equipo.', 'PROJECT_MODULE_DELIVERY_LIMITED_UPDATE'),
        );
      }
      if (command.data.estimatedDate !== undefined) {
        return err(
          new ForbiddenError('Solo quien administra el proyecto puede mover la fecha estimada.', 'PROJECT_MODULE_DELIVERY_LIMITED_UPDATE'),
        );
      }
      if (command.data.status !== undefined && command.data.status !== 'delivered') {
        return err(
          new ForbiddenError('Solo quien administra el proyecto puede aprobar o rechazar una entrega.', 'PROJECT_MODULE_DELIVERY_LIMITED_UPDATE'),
        );
      }
      const projectMembers = await this.members.listForProject(project.id);
      const isParticipant =
        snapshot.leaderUserId === command.actor.userId ||
        snapshot.developerUserId === command.actor.userId ||
        snapshot.commercialManagerUserId === command.actor.userId ||
        projectMembers.some((member) => member.userId === command.actor.userId);
      if (!isParticipant) return err(new ForbiddenError('No tienes acceso a este proyecto.', 'PROJECT_NOT_ASSIGNED'));
    }

    await this.modules.updateDelivery(
      command.deliveryId,
      {
        ...(command.data.teamId !== undefined ? { teamId: command.data.teamId ?? null } : {}),
        ...(command.data.status !== undefined ? { status: command.data.status } : {}),
        ...(command.data.estimatedDate !== undefined ? { estimatedDate: new Date(command.data.estimatedDate) } : {}),
      },
      this.clock.now(),
    );

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_delivery_updated', moduleId: command.moduleId, deliveryId: command.deliveryId },
    });

    return ok(undefined);
  }
}
