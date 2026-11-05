import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { Permission, UpdateProjectModuleSegmentInput } from '@kora/contracts';
import {
  CannotManageProjectError,
  InvalidSegmentMemberError,
  ProjectModuleNotFoundError,
  ProjectModuleSegmentNotFoundError,
  ProjectNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
  type ProjectModuleSegmentMemberInput,
} from '../../domain/repositories/project-module.repository';
import { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectModuleSegmentCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly segmentId: string;
  readonly data: UpdateProjectModuleSegmentInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class UpdateProjectModuleSegmentUseCase
  implements UseCase<UpdateProjectModuleSegmentCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    private readonly forecastSync: ForecastSourceSyncService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    private readonly progress: ProjectProgressRecalculator,
  ) {}

  async execute(command: UpdateProjectModuleSegmentCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    const segment = module.segments.find((s) => s.id === command.segmentId);
    if (!segment) {
      return err(new ProjectModuleSegmentNotFoundError(command.segmentId));
    }

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== command.actor.userId) {
      return err(new CannotManageProjectError());
    }

    // Sin `members` se conservan los actuales — salvo que cambie el equipo: los de antes ya no son de este equipo.
    const teamId = command.data.teamId ?? segment.teamId;
    let members: ProjectModuleSegmentMemberInput[] | undefined = command.data.members?.map((member) => ({
      teamMemberId: member.teamMemberId,
      dailyPercent: member.dailyPercent ?? null,
    }));
    if (members === undefined && teamId !== segment.teamId) members = [];
    if (members && !(await this.forecastSync.membersBelongToTeam(teamId, members))) {
      return err(new InvalidSegmentMemberError());
    }

    const nextTeamId = command.data.teamId ?? segment.teamId;
    const nextStartDate = command.data.startDate ?? segment.startDate.toISOString().slice(0, 10);
    const nextEndDate = command.data.endDate ?? segment.endDate.toISOString().slice(0, 10);
    if (nextStartDate > nextEndDate) {
      return err(new ForbiddenError('El inicio del bloque no puede superar su término.', 'PROJECT_SEGMENT_INVALID_DATES'));
    }
    const linkedTasks = module.tasks.filter((task) => task.segmentId === segment.id);
    if (linkedTasks.some((task) => task.teamId !== nextTeamId ||
      task.startDate.toISOString().slice(0, 10) < nextStartDate ||
      task.date.toISOString().slice(0, 10) > nextEndDate)) {
      return err(new ForbiddenError(
        'Este cambio deja tareas vinculadas fuera del equipo o las fechas del bloque.',
        'PROJECT_SEGMENT_TASKS_OUTSIDE_DATES',
      ));
    }
    const closingDelivery = module.deliveries.find((delivery) => delivery.segmentId === segment.id);
    if (nextTeamId !== segment.teamId && closingDelivery &&
      closingDelivery.status !== 'planned') {
      return err(new ForbiddenError(
        'Una entrega ya presentada o aprobada no puede cambiar de equipo.',
        'PROJECT_SEGMENT_DELIVERY_TEAM_LOCKED',
      ));
    }
    if (closingDelivery && closingDelivery.status !== 'planned' &&
      ((command.data.closingDelivery && (
        closingDelivery.name !== command.data.closingDelivery.name ||
        (closingDelivery.description ?? '') !== (command.data.closingDelivery.description ?? '')
      )) || nextEndDate !== closingDelivery.estimatedDate.toISOString().slice(0, 10))) {
      return err(new ForbiddenError(
        'Una entrega presentada o aprobada no permite alterar nombre, descripción ni fecha planificada.',
        'PROJECT_SEGMENT_DELIVERY_LOCKED',
      ));
    }
    if (command.data.closingDelivery === null &&
      closingDelivery && closingDelivery.status !== 'planned') {
      return err(new ForbiddenError(
        'No puedes eliminar una entrega ya presentada o aprobada.',
        'PROJECT_SEGMENT_DELIVERY_ALREADY_SUBMITTED',
      ));
    }
    const activeLinkedTasks = linkedTasks.filter((task) => !task.cancelledAt);
    if (command.data.closureAction === 'close' &&
      (closingDelivery || command.data.closingDelivery ||
        activeLinkedTasks.length === 0 ||
        activeLinkedTasks.some((task) => task.status !== 'done'))) {
      return err(new ForbiddenError(
        'El cierre manual requiere un bloque sin entrega y al menos una tarea activa, con todas aprobadas.',
        'PROJECT_SEGMENT_MANUAL_CLOSE_RESTRICTED',
      ));
    }
    const now = this.clock.now();
    await this.unitOfWork.run(async (tx) => {
      await this.modules.updateSegment(
        command.segmentId,
        {
          ...(command.data.teamId !== undefined ? { teamId: command.data.teamId } : {}),
          ...(command.data.name !== undefined ? { name: command.data.name } : {}),
          ...(command.data.startDate !== undefined ? { startDate: new Date(command.data.startDate) } : {}),
          ...(command.data.endDate !== undefined ? { endDate: new Date(command.data.endDate) } : {}),
          ...(command.data.estimatedHours !== undefined ? { estimatedHours: command.data.estimatedHours } : {}),
          ...(command.data.closureAction === 'close' ? { closedAt: now } : {}),
          ...(command.data.closureAction === 'reopen' ? { closedAt: null } : {}),
        },
        now,
        tx,
      );
      // La entrega de cierre pertenece a ESTE bloque. Nunca adivinarla por equipo/fecha.
      if (command.data.closingDelivery === null && closingDelivery) {
        await this.modules.removeDelivery(closingDelivery.id, tx);
      } else if (command.data.closingDelivery) {
        if (closingDelivery) {
          await this.modules.updateDelivery(closingDelivery.id, {
            name: command.data.closingDelivery.name,
            description: command.data.closingDelivery.description ?? null,
            estimatedDate: new Date(nextEndDate),
            teamId: nextTeamId,
            ...(nextTeamId !== segment.teamId ? { assigneeUserId: null } : {}),
          }, now, tx);
        } else {
          await this.modules.addDelivery({
            moduleId: command.moduleId, segmentId: segment.id,
            teamId: nextTeamId, name: command.data.closingDelivery.name,
            description: command.data.closingDelivery.description ?? null,
            estimatedDate: new Date(nextEndDate), assigneeUserId: null,
          }, now, tx);
        }
      } else if (closingDelivery &&
        (command.data.endDate !== undefined || command.data.teamId !== undefined)) {
        await this.modules.updateDelivery(closingDelivery.id, {
          estimatedDate: new Date(nextEndDate), teamId: nextTeamId,
          ...(nextTeamId !== segment.teamId ? { assigneeUserId: null } : {}),
        }, now, tx);
      }
      if (members) await this.modules.replaceSegmentMembers(command.segmentId, members, now, tx);
      await this.forecastSync.syncSegment(project, command.moduleId, command.segmentId, now, tx);
      await this.progress.recalculate(project.id, tx);
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_segment_updated', moduleId: command.moduleId,
        segmentId: command.segmentId, closureAction: command.data.closureAction ?? null,
        closingDeliveryUpdated: command.data.closingDelivery !== undefined },
    });

    return ok(undefined);
  }
}
