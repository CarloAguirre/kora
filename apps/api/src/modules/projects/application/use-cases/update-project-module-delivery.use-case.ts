import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ForbiddenError, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import {
  PROJECT_MODULE_DELIVERY_ALLOWED_TRANSITIONS,
  PROJECT_MODULE_DELIVERY_STATUS_LABELS,
  type Permission,
  type ProjectModuleDeliveryStatus,
  type UpdateProjectModuleDeliveryInput,
} from '@kora/contracts';
import {
  DeliveryAssigneeNotInTeamError,
  DeliveryOnBehalfCommentRequiredError,
  DeliveryTeamNotInProjectError,
  InvalidDeliveryStatusTransitionError,
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
  PROJECT_TEAM_MEMBER_REPOSITORY,
  type ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { ProjectChangeLogRecorder, type ProjectChangeLogEntry } from '../services/project-change-log.recorder';
import { deadlineNote, formatCommittedDate } from '../services/deadline-note';

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
 * terminada (`planned → delivered`): no puede autoaprobarse ni reasignarse.
 *
 * Los cambios de estado siguen `PROJECT_MODULE_DELIVERY_ALLOWED_TRANSITIONS`
 * (no se aprueba ni rechaza algo que nadie marcó como terminado), el
 * colaborador asignado tiene que ser del equipo de la entrega, y cada cambio
 * (estado, colaborador, equipo, fecha, nombre, descripción) queda en la
 * bitácora como `cambio_proyecto`.
 */
@Injectable()
export class UpdateProjectModuleDeliveryUseCase
  implements UseCase<UpdateProjectModuleDeliveryCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly projectTeamMembers: ProjectTeamMemberRepository,
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
      command.actorPermissions.includes('projects:manage') ||
      snapshot.leaderUserId === command.actor.userId ||
      (delivery.teamId != null &&
        (await this.projectTeams.isTeamLeaderForProject(project.id, delivery.teamId, command.actor.userId)));
    if (!canManage) {
      if (delivery.assigneeUserId !== command.actor.userId) {
        return err(new ForbiddenError('No tienes acceso a esta entrega.', 'PROJECT_MODULE_DELIVERY_NOT_ASSIGNEE'));
      }
      const onlyStatus = Object.keys(command.data).every((key) => key === 'status');
      if (!onlyStatus) {
        return err(new ForbiddenError('Solo puedes marcar tu entrega como terminada.', 'PROJECT_MODULE_DELIVERY_LIMITED_UPDATE'));
      }
      if (command.data.status !== undefined && (command.data.status !== 'delivered' || delivery.status !== 'planned')) {
        return err(
          new ForbiddenError(
            'Solo quien lidera el equipo o el proyecto puede aprobar, rechazar o revertir tu entrega.',
            'PROJECT_MODULE_DELIVERY_LIMITED_UPDATE',
          ),
        );
      }
    }

    // --- Equipo y colaborador -------------------------------------------------------------
    const teamChanged = command.data.teamId !== undefined && (command.data.teamId ?? null) !== delivery.teamId;
    const nextTeamId = command.data.teamId !== undefined ? (command.data.teamId ?? null) : delivery.teamId;
    let nextAssigneeUserId =
      command.data.assigneeUserId !== undefined ? (command.data.assigneeUserId ?? null) : delivery.assigneeUserId;

    const needsTeamData = teamChanged || (command.data.assigneeUserId != null && command.data.assigneeUserId !== delivery.assigneeUserId);
    const [teams, members] = needsTeamData
      ? await Promise.all([this.projectTeams.findByProject(project.id), this.projectTeamMembers.listForProject(project.id)])
      : [[], []];
    const isMemberOf = (userId: string, teamId: string | null) =>
      teamId !== null && members.some((member) => member.userId === userId && member.teamId === teamId);

    if (teamChanged && nextTeamId !== null && !teams.some((team) => team.teamId === nextTeamId)) {
      return err(new DeliveryTeamNotInProjectError());
    }
    if (command.data.assigneeUserId != null && command.data.assigneeUserId !== delivery.assigneeUserId) {
      if (!isMemberOf(command.data.assigneeUserId, nextTeamId)) return err(new DeliveryAssigneeNotInTeamError());
    } else if (command.data.assigneeUserId === undefined && teamChanged && nextAssigneeUserId !== null) {
      // Cambió el equipo y el colaborador actual no es del nuevo: queda sin asignar (el nuevo líder elige).
      if (!isMemberOf(nextAssigneeUserId, nextTeamId)) nextAssigneeUserId = null;
    }
    const assigneeChanged = nextAssigneeUserId !== delivery.assigneeUserId;

    // --- Estado ----------------------------------------------------------------------------
    const nextStatus = command.data.status;
    const statusChanged = nextStatus !== undefined && nextStatus !== delivery.status;
    if (statusChanged) {
      if (!PROJECT_MODULE_DELIVERY_ALLOWED_TRANSITIONS[delivery.status].includes(nextStatus)) {
        return err(new InvalidDeliveryStatusTransitionError(invalidTransitionMessage(delivery.status, nextStatus)));
      }
      if (nextStatus === 'delivered' && delivery.status === 'planned' && nextAssigneeUserId === null) {
        return err(
          new InvalidDeliveryStatusTransitionError('Asigna la entrega a un colaborador antes de marcarla como terminada.'),
        );
      }
      if (nextStatus === 'planned' && !command.data.rejectionReason?.trim()) {
        return err(new RejectionReasonRequiredError());
      }
      if (
        nextStatus === 'delivered' &&
        delivery.status === 'planned' &&
        nextAssigneeUserId !== command.actor.userId &&
        !command.data.comment?.trim()
      ) {
        return err(new DeliveryOnBehalfCommentRequiredError());
      }
    }

    const now = this.clock.now();
    // Cualquier cambio de estado limpia el motivo de un rechazo anterior, salvo que este mismo
    // llamado sea el que lo está fijando (rechazo explícito con su motivo).
    const rejectionReason =
      command.data.rejectionReason !== undefined
        ? (command.data.rejectionReason ?? null)
        : statusChanged
          ? null
          : undefined;

    await this.modules.updateDelivery(
      command.deliveryId,
      {
        ...(command.data.teamId !== undefined ? { teamId: nextTeamId } : {}),
        ...(command.data.name !== undefined ? { name: command.data.name } : {}),
        ...(command.data.description !== undefined ? { description: command.data.description ?? null } : {}),
        ...(assigneeChanged ? { assigneeUserId: nextAssigneeUserId } : {}),
        ...(nextStatus !== undefined ? { status: nextStatus } : {}),
        ...(command.data.estimatedDate !== undefined ? { estimatedDate: new Date(command.data.estimatedDate) } : {}),
        ...(rejectionReason !== undefined ? { rejectionReason } : {}),
      },
      now,
    );

    /**
     * La fila de "Entrega" en la bitácora muestra el estado ACTUAL de la entrega (y se ordena por su
     * fecha estimada), así que sin estos registros no quedaría rastro de quién la asignó, la terminó,
     * la aprobó o la rechazó, ni cuándo. Mismo criterio que `AddProjectModuleDeliveryUseCase`.
     */
    // Entregas antiguas no tienen nombre: sin él, "Entrega" a secas (no `Entrega "Entrega"`).
    const label = delivery.name ? ` "${delivery.name}"` : '';
    const inPhase = `en fase "${module.name}"`;
    const messages: string[] = [];

    if (command.data.name !== undefined && command.data.name !== delivery.name) {
      messages.push(`Entrega${label} renombrada a "${command.data.name}" ${inPhase}.`);
    }
    if (teamChanged) {
      const teamName = (teamId: string | null, fallback: string | null) =>
        teamId === null ? 'sin equipo' : `"${teams.find((team) => team.teamId === teamId)?.teamName ?? fallback ?? 'equipo'}"`;
      messages.push(
        `Entrega${label} ${inPhase}: equipo cambiado de ${teamName(delivery.teamId, delivery.teamName)} a ${teamName(nextTeamId, null)}.`,
      );
    }
    if (assigneeChanged) {
      const nextName = members.find((member) => member.userId === nextAssigneeUserId)?.fullName ?? 'colaborador';
      messages.push(
        nextAssigneeUserId === null
          ? `Entrega${label} ${inPhase} quedó sin colaborador asignado.`
          : delivery.assigneeUserId === null
            ? `Entrega${label} asignada a ${nextName} ${inPhase}.`
            : `Entrega${label} reasignada de ${delivery.assigneeName ?? 'otro colaborador'} a ${nextName} ${inPhase}.`,
      );
    }
    if (command.data.estimatedDate !== undefined) {
      const nextDate = new Date(command.data.estimatedDate);
      if (nextDate.getTime() !== delivery.estimatedDate.getTime()) {
        messages.push(
          `Entrega${label} ${inPhase}: fecha estimada cambiada de ${formatCommittedDate(delivery.estimatedDate)} a ${formatCommittedDate(nextDate)}.`,
        );
      }
    }
    if (command.data.description !== undefined && (command.data.description ?? null) !== delivery.description) {
      messages.push(`Entrega${label} ${inPhase}: descripción actualizada.`);
    }
    if (statusChanged) {
      // Contra la fecha estimada vigente (la de este mismo llamado si también la cambia).
      const committedDate = command.data.estimatedDate !== undefined ? new Date(command.data.estimatedDate) : delivery.estimatedDate;
      // Un líder puede marcarla terminada por el colaborador — que se sepa que no fue él.
      const assigneeName =
        members.find((member) => member.userId === nextAssigneeUserId)?.fullName ?? delivery.assigneeName ?? 'el colaborador asignado';
      const onBehalfOf = nextAssigneeUserId !== command.actor.userId ? ` en nombre de ${assigneeName}` : '';
      messages.push(
        delivery.status === 'planned'
          ? `Entrega${label} marcada como terminada${onBehalfOf} ${inPhase}, ${deadlineNote(committedDate, now)}; queda pendiente de aprobación.${onBehalfOf ? ` Motivo: ${command.data.comment?.trim()}` : ''}`
          : nextStatus === 'approved'
            ? `Entrega${label} aprobada ${inPhase}, ${deadlineNote(committedDate, now)}.`
            : nextStatus === 'planned'
              ? `Entrega${label} rechazada ${inPhase}: ${rejectionReason}`
              : `Se revirtió la aprobación de la entrega${label} ${inPhase}; vuelve a quedar pendiente de aprobación.`,
      );
    }

    if (messages.length > 0) {
      const entries: ProjectChangeLogEntry[] = messages.map((message) => ({
        projectId: project.id,
        moduleId: command.moduleId,
        deliveryId: command.deliveryId,
        message,
      }));
      await this.changeLog.record(entries, command.actor.userId, now);
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

function invalidTransitionMessage(from: ProjectModuleDeliveryStatus, to: ProjectModuleDeliveryStatus): string {
  if (from === 'planned' && to === 'approved') {
    return 'Solo se puede aprobar una entrega que el colaborador ya marcó como terminada.';
  }
  if (from === 'approved' && to === 'planned') {
    return 'Una entrega aprobada no se rechaza directamente: primero revierte la aprobación.';
  }
  return `No se puede pasar una entrega de "${PROJECT_MODULE_DELIVERY_STATUS_LABELS[from]}" a "${PROJECT_MODULE_DELIVERY_STATUS_LABELS[to]}".`;
}
