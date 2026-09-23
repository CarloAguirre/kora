import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import type { Permission, UpdateProjectInput } from '@kora/contracts';
import {
  CannotManageProjectError,
  ProjectNameAlreadyInUseError,
  ProjectNotFoundError,
  ReferencedClientNotFoundError,
} from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import { PROJECT_CLIENT_READER, type ProjectClientReader } from '../ports/project-client-reader.port';
import { PROJECT_USER_READER, type ProjectUserReader } from '../ports/project-user-reader.port';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';
import { ProjectChangeLogRecorder, type ProjectChangeLogEntry } from '../services/project-change-log.recorder';

const formatDate = (value: Date | null): string =>
  value ? value.toLocaleDateString('es-CL') : 'sin definir';

export interface UpdateProjectCommand {
  readonly projectId: string;
  readonly data: UpdateProjectInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

@Injectable()
export class UpdateProjectUseCase implements UseCase<UpdateProjectCommand, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_CLIENT_READER) private readonly clients: ProjectClientReader,
    @Inject(PROJECT_USER_READER) private readonly users: ProjectUserReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly changeLog: ProjectChangeLogRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectCommand): Promise<Result<void, ApplicationError>> {
    const { projectId, data, actor } = command;

    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(projectId));

    if (!command.actorPermissions.includes('projects:manage') && project.leaderUserId !== actor.userId) {
      return err(new CannotManageProjectError());
    }

    if (data.clientId !== undefined && data.clientId !== null) {
      const client = await this.clients.findById(data.clientId);
      if (!client) return err(new ReferencedClientNotFoundError(data.clientId));
    }

    if (data.name !== undefined && data.name.trim() !== project.name) {
      const clientId = data.clientId !== undefined ? data.clientId : project.clientId;
      if (await this.projects.nameIsTakenByAnother(data.name.trim(), clientId, project.id)) {
        return err(new ProjectNameAlreadyInUseError(data.name));
      }
    }

    const before = project.toSnapshot();
    const now = this.clock.now();

    const updated = project.updateDetails(
      {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.clientId !== undefined ? { clientId: data.clientId } : {}),
        ...(data.salesStage !== undefined ? { salesStage: data.salesStage } : {}),
        ...(data.phase !== undefined ? { phase: data.phase } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.leaderUserId !== undefined ? { leaderUserId: data.leaderUserId } : {}),
        ...(data.developerUserId !== undefined ? { developerUserId: data.developerUserId } : {}),
        ...(data.commercialManagerUserId !== undefined
          ? { commercialManagerUserId: data.commercialManagerUserId }
          : {}),
        ...(data.startDate !== undefined
          ? { startDate: data.startDate ? new Date(data.startDate) : null }
          : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
        ...(data.estimatedDeliveryDate !== undefined
          ? { estimatedDeliveryDate: data.estimatedDeliveryDate ? new Date(data.estimatedDeliveryDate) : null }
          : {}),
        ...(data.soldHours !== undefined ? { soldHours: data.soldHours } : {}),
        ...(data.expectedProgress !== undefined ? { expectedProgress: data.expectedProgress } : {}),
        ...(data.actualProgress !== undefined ? { actualProgress: data.actualProgress } : {}),
        ...(data.supportPlanDescription !== undefined
          ? { supportPlanDescription: data.supportPlanDescription || null }
          : {}),
        ...(data.supportHours !== undefined ? { supportHours: data.supportHours } : {}),
        ...(data.quotationLink !== undefined ? { quotationLink: data.quotationLink || null } : {}),
        ...(data.contractLink !== undefined ? { contractLink: data.contractLink || null } : {}),
        ...(data.onHoldReason !== undefined ? { onHoldReason: data.onHoldReason || null } : {}),
        ...(data.stopsClock !== undefined ? { stopsClock: data.stopsClock } : {}),
        ...(data.scopeNotes !== undefined ? { scopeNotes: data.scopeNotes || null } : {}),
        ...(data.deliveryDocumentation !== undefined
          ? { deliveryDocumentation: data.deliveryDocumentation || null }
          : {}),
        ...(data.demoLink !== undefined ? { demoLink: data.demoLink || null } : {}),
        ...(data.testEnvironmentLink !== undefined ? { testEnvironmentLink: data.testEnvironmentLink || null } : {}),
        ...(data.figmaLink !== undefined ? { figmaLink: data.figmaLink || null } : {}),
        ...(data.documentationLink !== undefined ? { documentationLink: data.documentationLink || null } : {}),
        ...(data.impactBeforeHours !== undefined ? { impactBeforeHours: data.impactBeforeHours } : {}),
        ...(data.impactBeforePeople !== undefined ? { impactBeforePeople: data.impactBeforePeople || null } : {}),
        ...(data.impactBeforeDuration !== undefined
          ? { impactBeforeDuration: data.impactBeforeDuration || null }
          : {}),
        ...(data.impactBeforeModality !== undefined
          ? { impactBeforeModality: data.impactBeforeModality || null }
          : {}),
        ...(data.impactAfterHours !== undefined ? { impactAfterHours: data.impactAfterHours } : {}),
        ...(data.impactAfterPeople !== undefined ? { impactAfterPeople: data.impactAfterPeople || null } : {}),
        ...(data.impactAfterDuration !== undefined ? { impactAfterDuration: data.impactAfterDuration || null } : {}),
        ...(data.impactAfterModality !== undefined ? { impactAfterModality: data.impactAfterModality || null } : {}),
        ...(data.qaTestingStartDate !== undefined
          ? { qaTestingStartDate: data.qaTestingStartDate ? new Date(data.qaTestingStartDate) : null }
          : {}),
        ...(data.qaTestingEndDate !== undefined
          ? { qaTestingEndDate: data.qaTestingEndDate ? new Date(data.qaTestingEndDate) : null }
          : {}),
        ...(data.qaEvaluatedModule !== undefined ? { qaEvaluatedModule: data.qaEvaluatedModule || null } : {}),
        ...(data.qaPlannedTests !== undefined ? { qaPlannedTests: data.qaPlannedTests } : {}),
        ...(data.qaExecutedTests !== undefined ? { qaExecutedTests: data.qaExecutedTests } : {}),
        ...(data.qaFailedTests !== undefined ? { qaFailedTests: data.qaFailedTests } : {}),
      },
      now,
    );
    if (updated.isErr()) return err(updated.error);

    const after = project.toSnapshot();
    const changeEntries: ProjectChangeLogEntry[] = [];

    if (before.leaderUserId !== after.leaderUserId) {
      const ids = [before.leaderUserId, after.leaderUserId].filter((id): id is string => id !== null);
      const resolved = ids.length > 0 ? await this.users.findManyByIds(ids) : [];
      const nameOf = (id: string | null) => (id ? (resolved.find((u) => u.id === id)?.fullName ?? 'desconocido') : null);
      const oldName = nameOf(before.leaderUserId);
      const newName = nameOf(after.leaderUserId);
      changeEntries.push({
        projectId: project.id,
        message:
          !before.leaderUserId && newName
            ? `Líder asignado: ${newName}.`
            : !after.leaderUserId && oldName
              ? `Líder removido (antes ${oldName}).`
              : `Líder cambiado de ${oldName} a ${newName}.`,
      });
    }

    if (before.soldHours !== after.soldHours) {
      changeEntries.push({
        projectId: project.id,
        message: `HH vendidas actualizadas de ${before.soldHours} a ${after.soldHours}.`,
      });
    }

    if (before.startDate?.getTime() !== after.startDate?.getTime()) {
      changeEntries.push({
        projectId: project.id,
        message: `Fecha de inicio actualizada de ${formatDate(before.startDate)} a ${formatDate(after.startDate)}.`,
      });
    }

    if (before.endDate?.getTime() !== after.endDate?.getTime()) {
      changeEntries.push({
        projectId: project.id,
        message: `Fecha de fin actualizada de ${formatDate(before.endDate)} a ${formatDate(after.endDate)}.`,
      });
    }

    if (before.estimatedDeliveryDate?.getTime() !== after.estimatedDeliveryDate?.getTime()) {
      changeEntries.push({
        projectId: project.id,
        message: `Fecha de entrega estimada actualizada de ${formatDate(before.estimatedDeliveryDate)} a ${formatDate(after.estimatedDeliveryDate)}.`,
      });
    }

    try {
      await this.unitOfWork.run(async (tx) => {
        await this.projects.save(project, tx);
        if (data.teams) {
          const existingTeams = await this.projectTeams.findByProject(project.id, tx);
          const keptTeamIds = new Set(data.teams.map((team) => team.teamId));
          for (const existing of existingTeams) {
            if (!keptTeamIds.has(existing.teamId)) {
              await this.projectTeams.remove(project.id, existing.teamId, tx);
              changeEntries.push({
                projectId: project.id,
                message: `Equipo "${existing.teamName}" retirado del proyecto.`,
              });
            }
          }
          for (const team of data.teams) {
            await this.projectTeams.save(
              {
                projectId: project.id,
                teamId: team.teamId,
                leaderUserId: team.leaderUserId ?? null,
                memberCount: team.memberCount ?? null,
                assignedHours: team.assignedHours ?? null,
              },
              tx,
            );
          }
          const existingTeamIds = new Set(existingTeams.map((t) => t.teamId));
          const addedTeamIds = data.teams.map((t) => t.teamId).filter((id) => !existingTeamIds.has(id));
          if (addedTeamIds.length > 0) {
            const updatedTeams = await this.projectTeams.findByProject(project.id, tx);
            for (const teamId of addedTeamIds) {
              const teamName = updatedTeams.find((t) => t.teamId === teamId)?.teamName ?? teamId;
              changeEntries.push({ projectId: project.id, message: `Equipo "${teamName}" agregado al proyecto.` });
            }
          }
        }

        if (changeEntries.length > 0) {
          await this.changeLog.record(changeEntries, actor.userId, now, tx);
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) return err(new ProjectNameAlreadyInUseError(data.name ?? project.name));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
    });

    return ok(undefined);
  }
}
