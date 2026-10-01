import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ForbiddenError,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import {
  PROJECT_MODULE_TASK_SCOPE_LABELS,
  PROJECT_MODULE_TASK_STATUS_LABELS,
  type Permission,
  type ProjectModuleTaskStatus,
  type UpdateProjectModuleTaskInput,
} from '@kora/contracts';
import {
  ProjectModuleNotFoundError,
  ProjectModuleTaskNotFoundError,
  ProjectNotFoundError,
  RejectionReasonRequiredError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import {
  PROJECT_MODULE_REPOSITORY,
  type ProjectModuleRepository,
  type ProjectModuleTaskRecord,
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
import { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import { deadlineNote, formatCommittedDate } from '../services/deadline-note';
import { ProjectProgressRecalculator } from '../services/project-progress-recalculator';

export interface UpdateProjectModuleTaskCommand {
  readonly projectId: string;
  readonly moduleId: string;
  readonly taskId: string;
  readonly data: UpdateProjectModuleTaskInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Además del líder (`projects:manage`), de quien lidera el equipo de la tarea
 * y de quien lidera EL PROYECTO (edición completa, igual que si pudiera
 * crearla), la persona asignada puede actualizarla — pero solo su `status`
 * ("Iniciar"/"Marcar como completada" en "Mis tareas"), no
 * reasignarla ni cambiar sus fechas, y sin poder saltar directo a
 * `done`: solo quien administra el proyecto o lidera el equipo puede
 * aprobar (`done`), rechazar (`in_progress` + `rejectionReason`) o revertir
 * (`in_review`) — ver `PROJECT_MODULE_TASK_ASSIGNEE_ALLOWED_STATUSES`.
 *
 * Cada cambio (estado, colaborador, equipo, fechas, nombre, HH, ámbito) queda en la bitácora como
 * `cambio_proyecto` ligado a la tarea (`taskId`), con quién y cuándo — y al terminarla o aprobarla,
 * si fue a tiempo o con cuántos días de atraso respecto de su fecha límite.
 */
const PROJECT_MODULE_TASK_ASSIGNEE_ALLOWED_STATUSES = new Set(['todo', 'in_progress', 'in_review']);
@Injectable()
export class UpdateProjectModuleTaskUseCase
  implements UseCase<UpdateProjectModuleTaskCommand, void, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_MODULE_REPOSITORY) private readonly modules: ProjectModuleRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_TEAM_MEMBER_REPOSITORY) private readonly projectTeamMembers: ProjectTeamMemberRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    private readonly progress: ProjectProgressRecalculator,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
  ) {}

  async execute(command: UpdateProjectModuleTaskCommand): Promise<Result<void, ApplicationError>> {
    const project = await this.projects.findById(command.projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(command.projectId));

    const module = await this.modules.findById(command.moduleId);
    if (!module || module.projectId !== project.id) {
      return err(new ProjectModuleNotFoundError(command.moduleId));
    }

    const task = module.tasks.find((t) => t.id === command.taskId);
    if (!task) return err(new ProjectModuleTaskNotFoundError(command.taskId));

    const canManage =
      command.actorPermissions.includes('projects:manage') || project.leaderUserId === command.actor.userId;
    if (!canManage) {
      const isTeamLeader =
        task.teamId != null &&
        (await this.projectTeams.isTeamLeaderForProject(project.id, task.teamId, command.actor.userId));
      if (!isTeamLeader) {
        if (task.assigneeUserId !== command.actor.userId) {
          return err(new ForbiddenError('No tienes acceso a esta tarea.', 'PROJECT_MODULE_TASK_NOT_ASSIGNEE'));
        }
        const onlyStatus = Object.keys(command.data).every((key) => key === 'status');
        if (!onlyStatus) {
          return err(new ForbiddenError('Solo puedes cambiar el estado de tu tarea.', 'PROJECT_MODULE_TASK_LIMITED_UPDATE'));
        }
        if (command.data.status !== undefined && !PROJECT_MODULE_TASK_ASSIGNEE_ALLOWED_STATUSES.has(command.data.status)) {
          return err(
            new ForbiddenError('Solo quien lidera el equipo o el proyecto puede aprobar tu tarea.', 'PROJECT_MODULE_TASK_LIMITED_UPDATE'),
          );
        }
      }
    }

    const now = this.clock.now();
    const nextStatus = command.data.status;
    if (nextStatus === 'in_progress' && task.status === 'in_review' && !command.data.rejectionReason?.trim()) {
      return err(new RejectionReasonRequiredError());
    }
    const completedAt =
      nextStatus === undefined
        ? undefined
        : nextStatus === 'done'
          ? now
          : task.status === 'done'
            ? null
            : undefined;
    // Cualquier cambio de estado limpia el motivo de un rechazo anterior, salvo que este mismo
    // llamado sea el que lo está fijando (rechazo explícito con su motivo).
    const rejectionReason =
      command.data.rejectionReason !== undefined
        ? (command.data.rejectionReason ?? null)
        : nextStatus !== undefined
          ? null
          : undefined;

    // Se describen contra el estado previo, antes de escribir: cambio y registro van en la misma
    // transacción — si no se puede escribir la bitácora, la tarea tampoco cambia.
    const messages = await this.describeChanges(project.id, module.name, task, command.data, rejectionReason ?? null, now);
    await this.unitOfWork.run(async (tx) => {
      await this.modules.updateTask(
        command.taskId,
        {
          ...(command.data.teamId !== undefined ? { teamId: command.data.teamId ?? null } : {}),
          ...(command.data.assigneeUserId !== undefined ? { assigneeUserId: command.data.assigneeUserId ?? null } : {}),
          ...(command.data.name !== undefined ? { name: command.data.name } : {}),
          ...(command.data.description !== undefined ? { description: command.data.description ?? null } : {}),
          ...(command.data.startDate !== undefined
            ? { startDate: command.data.startDate ? new Date(command.data.startDate) : null }
            : {}),
          ...(command.data.date !== undefined ? { date: new Date(command.data.date) } : {}),
          ...(command.data.estimatedHours !== undefined
            ? { estimatedHours: command.data.estimatedHours }
            : {}),
          ...(nextStatus !== undefined ? { status: nextStatus } : {}),
          ...(command.data.scope !== undefined ? { scope: command.data.scope } : {}),
          ...(completedAt !== undefined ? { completedAt } : {}),
          ...(rejectionReason !== undefined ? { rejectionReason } : {}),
        },
        now,
        tx,
      );
      if (messages.length > 0) {
        await this.changeLog.record(
          messages.map((message) => ({ projectId: project.id, moduleId: command.moduleId, taskId: command.taskId, message })),
          command.actor.userId,
          now,
          tx,
        );
      }
      await this.progress.recalculate(project.id, tx);
    });

    await this.audit.record({
      actor: { userId: command.actor.userId, email: command.actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'module_task_updated', moduleId: command.moduleId, taskId: command.taskId },
    });

    return ok(undefined);
  }

  /** Un mensaje por cambio real — un campo enviado con el mismo valor que ya tenía no genera registro. */
  private async describeChanges(
    projectId: string,
    moduleName: string,
    task: ProjectModuleTaskRecord,
    data: UpdateProjectModuleTaskInput,
    rejectionReason: string | null,
    now: Date,
  ): Promise<string[]> {
    const label = `Tarea "${task.name}"`;
    const inPhase = `en fase "${moduleName}"`;
    const messages: string[] = [];
    const sameDay = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

    if (data.name !== undefined && data.name !== task.name) {
      messages.push(`${label} renombrada a "${data.name}" ${inPhase}.`);
    }
    if (data.teamId !== undefined && (data.teamId ?? null) !== task.teamId) {
      const teams = await this.projectTeams.findByProject(projectId);
      const teamName = (teamId: string | null) =>
        teamId === null
          ? 'sin equipo'
          : `"${teams.find((team) => team.teamId === teamId)?.teamName ?? (teamId === task.teamId ? task.teamName : null) ?? 'equipo'}"`;
      messages.push(`${label} ${inPhase}: equipo cambiado de ${teamName(task.teamId)} a ${teamName(data.teamId ?? null)}.`);
    }
    if (data.assigneeUserId !== undefined && (data.assigneeUserId ?? null) !== task.assigneeUserId) {
      const nextId = data.assigneeUserId ?? null;
      const nextName = nextId
        ? ((await this.projectTeamMembers.listForProject(projectId)).find((member) => member.userId === nextId)?.fullName ??
          'colaborador')
        : null;
      messages.push(
        nextName === null
          ? `${label} ${inPhase} quedó sin colaborador asignado.`
          : task.assigneeUserId === null
            ? `${label} asignada a ${nextName} ${inPhase}.`
            : `${label} reasignada de ${task.assigneeName ?? 'otro colaborador'} a ${nextName} ${inPhase}.`,
      );
    }
    if (data.startDate !== undefined) {
      const next = data.startDate ? new Date(data.startDate) : null;
      if (!sameDay(next, task.startDate)) {
        const show = (value: Date | null) => (value ? formatCommittedDate(value) : 'sin definir');
        messages.push(`${label} ${inPhase}: fecha de inicio cambiada de ${show(task.startDate)} a ${show(next)}.`);
      }
    }
    if (data.date !== undefined && !sameDay(new Date(data.date), task.date)) {
      messages.push(
        `${label} ${inPhase}: fecha límite cambiada de ${formatCommittedDate(task.date)} a ${formatCommittedDate(new Date(data.date))}.`,
      );
    }
    if (data.estimatedHours !== undefined && (data.estimatedHours ?? null) !== task.estimatedHours) {
      const show = (value: number | null) => (value === null ? 'sin estimar' : `${value} HH`);
      messages.push(`${label} ${inPhase}: HH estimadas cambiadas de ${show(task.estimatedHours)} a ${show(data.estimatedHours ?? null)}.`);
    }
    if (data.scope !== undefined && data.scope !== task.scope) {
      messages.push(
        `${label} ${inPhase}: ámbito cambiado de ${PROJECT_MODULE_TASK_SCOPE_LABELS[task.scope]} a ${PROJECT_MODULE_TASK_SCOPE_LABELS[data.scope]}.`,
      );
    }
    if (data.description !== undefined && (data.description ?? null) !== task.description) {
      messages.push(`${label} ${inPhase}: descripción actualizada.`);
    }
    if (data.status !== undefined && data.status !== task.status) {
      // Contra la fecha límite vigente (la de este mismo llamado si también la cambia).
      const committed = data.date !== undefined ? new Date(data.date) : task.date;
      messages.push(taskStatusMessage(label, inPhase, task.status, data.status, rejectionReason, deadlineNote(committed, now)));
    }
    return messages;
  }
}

function taskStatusMessage(
  label: string,
  inPhase: string,
  from: ProjectModuleTaskStatus,
  to: ProjectModuleTaskStatus,
  rejectionReason: string | null,
  deadline: string,
): string {
  if (to === 'done') {
    return from === 'in_review'
      ? `${label} aprobada ${inPhase}, ${deadline}.`
      : `${label} marcada como aprobada ${inPhase}, ${deadline}.`;
  }
  if (to === 'in_review') {
    return from === 'done'
      ? `Se revirtió la aprobación de la tarea ${label.slice('Tarea '.length)} ${inPhase}; vuelve a Completada.`
      : `${label} marcada como completada ${inPhase}, pendiente de aprobación, ${deadline}.`;
  }
  if (to === 'in_progress' && from === 'in_review' && rejectionReason) {
    return `${label} rechazada ${inPhase}: ${rejectionReason}`;
  }
  if (to === 'in_progress' && from === 'todo') return `${label} iniciada ${inPhase}.`;
  return `${label} ${inPhase}: estado cambiado de "${PROJECT_MODULE_TASK_STATUS_LABELS[from]}" a "${PROJECT_MODULE_TASK_STATUS_LABELS[to]}".`;
}
