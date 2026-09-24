import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, UpdateProjectModuleDeliveryInput } from '@kora/contracts';
import {
  ProjectModuleDeliveryNotFoundError,
  ProjectModuleNotFoundError,
  ProjectNotFoundError,
  RejectionReasonRequiredError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
} from '../../domain/repositories/project-module.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';

export interface UpdateProjectModuleDeliveryCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly deliveryId: string;
  readonly data: UpdateProjectModuleDeliveryInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Además del líder (`projects:manage` o `project.leaderUserId`) y de quien
 * lidera el equipo responsable de la entrega — ambos con acceso completo
 * (reasignar equipo/colaborador, aprobar, rechazar, revertir, editar nombre/
 * fecha) — el colaborador asignado (`delivery.assigneeUserId`) puede
 * actualizarla, pero solo su `status`, y únicamente para marcarla como
 * entregada (`delivered`): no puede autoaprobarse ni reasignarse. Mismo
 * patrón que `UpdateProjectModuleTaskUseCase`.
 */
@Injectable()
export class UpdateProjectModuleDeliveryUseCase
  implements UseCase<UpdateProjectModuleDeliveryCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectModuleDeliveryCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    const delivery = module.deliveries.find((d) => d.id === command.deliveryId);
    if (!delivery) return err(new ProjectModuleDeliveryNotFoundError(command.deliveryId));

    const snapshot = project.toSnapshot();
    const canManage =
      command.actorPermissions.includes('projects:manage') || snapshot.leaderUserId === command.actor.userId;
    if (!canManage) {
      const isTeamLeader =
        delivery.teamId != null &&
        (await this.projectTeams.isTeamLeaderForProject(project.id, delivery.teamId, command.actor.userId));
      if (!isTeamLeader) {
        if (delivery.assigneeUserId !== command.actor.userId) {
          return err(new ForbiddenError('No tienes acceso a esta entrega.', 'PROJECT_MODULE_DELIVERY_NOT_ASSIGNEE'));
        }
        const onlyStatus = Object.keys(command.data).every((key) => key === 'status');
        if (!onlyStatus) {
          return err(new ForbiddenError('Solo puedes marcar tu entrega como enviada.', 'PROJECT_MODULE_DELIVERY_LIMITED_UPDATE'));
        }
        if (command.data.status !== undefined && command.data.status !== 'delivered') {
          return err(
            new ForbiddenError(
              'Solo quien lidera el equipo o el proyecto puede aprobar o rechazar tu entrega.',
              'PROJECT_MODULE_DELIVERY_LIMITED_UPDATE',
            ),
          );
        }
      }
    }

    const now = this.clock.now();
    const nextStatus = command.data.status;
    if (nextStatus === 'planned' && delivery.status === 'delivered' && !command.data.rejectionReason?.trim()) {
      return err(new RejectionReasonRequiredError());
    }
    // Cualquier cambio de estado limpia el motivo de un rechazo anterior, salvo que este mismo
    // llamado sea el que lo está fijando (rechazo explícito con su motivo).
    const rejectionReason =
      command.data.rejectionReason !== undefined
        ? (command.data.rejectionReason ?? null)
        : nextStatus !== undefined
          ? null
          : undefined;

    await this.modules.updateDelivery(
      command.deliveryId,
      {
        ...(command.data.teamId !== undefined ? { teamId: command.data.teamId ?? null } : {}),
        ...(command.data.name !== undefined ? { name: command.data.name } : {}),
        ...(command.data.description !== undefined ? { description: command.data.description ?? null } : {}),
        ...(command.data.assigneeUserId !== undefined ? { assigneeUserId: command.data.assigneeUserId ?? null } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(command.data.estimatedDate !== undefined ? { estimatedDate: new Date(command.data.estimatedDate) } : {}),
        ...(rejectionReason !== undefined ? { rejectionReason } : {}),
      },
      now,
    );

    /**
     * Sin esto, el líder de proyecto no se entera de que su equipo aprobó/rechazó/entregó
     * algo: la fila de "Entrega" en la bitácora es de solo lectura y se ordena por su fecha
     * estimada (no por cuándo cambió el estado), así que un cambio de estado no aparece
     * como un evento nuevo ahí. Mismo criterio que `AddProjectModuleDeliveryUseCase`.
     */
    if (nextStatus !== undefined && nextStatus !== delivery.status) {
      const deliveryLabel = delivery.name ?? 'Entrega';
      const message =
        nextStatus === 'delivered'
          ? `Entrega "${deliveryLabel}" marcada como entregada en fase "${module.name}".`
          : nextStatus === 'approved'
            ? `Entrega "${deliveryLabel}" aprobada en fase "${module.name}".`
            : rejectionReason
              ? `Entrega "${deliveryLabel}" rechazada en fase "${module.name}": ${rejectionReason}`
              : `Entrega "${deliveryLabel}" revertida a en revisión en fase "${module.name}".`;
      await this.changeLog.record(
        [{ projectId: project.id, moduleId: command.moduleId, message }],
        command.actor.userId,
        now,
      );
    }

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
