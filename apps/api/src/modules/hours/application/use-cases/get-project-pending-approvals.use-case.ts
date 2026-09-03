import { Inject, Injectable } from '@nestjs/common';
import { ForbiddenError, err, ok, type ApplicationError, type Result } from '@kora/core';
import type { ProjectPendingApprovalsResponse, RoleCode } from '@kora/contracts';
import { ReferencedProjectNotFoundError } from '../../domain/errors/hour-entry.errors';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import { HOUR_ENTRY_PROJECT_READER, type HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface GetProjectPendingApprovalsCommand {
  readonly projectId: string;
  readonly actor: ActorContext;
  readonly actorRole: RoleCode;
}

/**
 * Resumen, para el líder del proyecto, de las horas pendientes que quedaron
 * EXCLUYENTEMENTE en manos de un líder de equipo (ver el cambio a
 * `isProjectLeaderOrTeamLeaderOfMember` en docs/DECISION-M4-HORAS.md): el
 * líder de proyecto ya no puede aprobarlas directamente, pero necesita
 * enterarse de que están ahí, con quién y de qué colaborador son — por eso
 * cada grupo (por líder de equipo) trae el desglose por colaborador, no solo
 * el total. No incluye lo que sigue pendiente DIRECTAMENTE con el propio
 * líder de proyecto (eso ya lo ve en "Aprobaciones") ni pasa por el alcance
 * de `hours:read_team` — la autorización acá es "eres el líder de este
 * proyecto (o admin/pmo)", no "lideras el equipo del autor".
 */
@Injectable()
export class GetProjectPendingApprovalsUseCase
  implements UseCase<GetProjectPendingApprovalsCommand, ProjectPendingApprovalsResponse, ApplicationError>
{
  constructor(
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly entries: HourEntryRepository,
    @Inject(HOUR_ENTRY_PROJECT_READER) private readonly projects: HourEntryProjectReader,
  ) {}

  async execute(
    command: GetProjectPendingApprovalsCommand,
  ): Promise<Result<ProjectPendingApprovalsResponse, ApplicationError>> {
    const { projectId, actor, actorRole } = command;

    const project = await this.projects.findById(projectId);
    if (!project) return err(new ReferencedProjectNotFoundError(projectId));

    const isAdminTier = actorRole === 'admin' || actorRole === 'pmo';
    if (!isAdminTier && project.leaderUserId !== actor.userId) {
      return err(
        new ForbiddenError('Solo el líder del proyecto puede ver este resumen.', 'PROJECT_PENDING_APPROVALS_FORBIDDEN'),
      );
    }

    const pending = await this.entries.search(
      { projectId, status: 'pending', visibleToUserIds: undefined },
      { page: 1, pageSize: 1000 },
      { field: 'date', direction: 'asc' },
    );

    const distinctOwnerIds = [...new Set(pending.items.map((item) => item.userId))];
    const approversByOwner = new Map<string, readonly { id: string; fullName: string }[]>();
    await Promise.all(
      distinctOwnerIds.map(async (ownerId) => {
        approversByOwner.set(ownerId, await this.projects.findApprovers(projectId, ownerId));
      }),
    );

    interface CollaboratorAgg {
      userId: string;
      userName: string;
      entryCount: number;
      totalHours: number;
      oldestPendingDate: string;
    }
    interface GroupAgg {
      approverUserId: string;
      approverName: string;
      collaborators: Map<string, CollaboratorAgg>;
    }

    const groups = new Map<string, GroupAgg>();

    for (const item of pending.items) {
      const approvers = approversByOwner.get(item.userId) ?? [];
      const entryDate = item.date.toISOString().slice(0, 10);

      for (const approver of approvers) {
        // Excluyente por diseño (ver `findApproverCandidatesForMember`): si
        // el aprobador resuelto ES el líder del proyecto, es porque el autor
        // no tiene líder de equipo — ya está pendiente CON el propio líder
        // de proyecto, no hace falta "informarle" de sí mismo.
        if (approver.id === project.leaderUserId) continue;

        const group = groups.get(approver.id) ?? { approverUserId: approver.id, approverName: approver.fullName, collaborators: new Map() };
        groups.set(approver.id, group);

        const collaborator = group.collaborators.get(item.userId);
        if (collaborator) {
          collaborator.entryCount += 1;
          collaborator.totalHours += item.hours;
          if (entryDate < collaborator.oldestPendingDate) collaborator.oldestPendingDate = entryDate;
        } else {
          group.collaborators.set(item.userId, {
            userId: item.userId,
            userName: item.userFullName,
            entryCount: 1,
            totalHours: item.hours,
            oldestPendingDate: entryDate,
          });
        }
      }
    }

    const result = [...groups.values()].map((group) => {
      const collaborators = [...group.collaborators.values()].sort((a, b) => a.oldestPendingDate.localeCompare(b.oldestPendingDate));
      return {
        approverUserId: group.approverUserId,
        approverName: group.approverName,
        entryCount: collaborators.reduce((sum, c) => sum + c.entryCount, 0),
        totalHours: collaborators.reduce((sum, c) => sum + c.totalHours, 0),
        oldestPendingDate: collaborators[0]?.oldestPendingDate ?? '',
        collaborators,
      };
    });

    return ok({ groups: result.sort((a, b) => a.oldestPendingDate.localeCompare(b.oldestPendingDate)) });
  }
}
