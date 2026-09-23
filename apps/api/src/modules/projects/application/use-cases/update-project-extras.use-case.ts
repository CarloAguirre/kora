import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, err, ok, type ApplicationError, type Clock, type Result } from '@kora/core';
import type { Permission, UpdateProjectExtrasInput } from '@kora/contracts';
import { CannotEditProjectExtrasError, ProjectNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateProjectExtrasCommand {
  readonly projectId: string;
  readonly data: UpdateProjectExtrasInput;
  readonly actor: ActorContext;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Editar la pestaña "Extras" (accesos, impacto de negocio, métricas QA) es
 * un endpoint propio, separado de `PATCH /projects/:id` (`UpdateProjectUseCase`,
 * que sigue exigiendo `projects:manage` a nivel de decorador para el resto de
 * los campos del proyecto — cliente, líder, horas vendidas, equipos). Estos
 * campos son de bajo riesgo (contenido del proyecto, no su administración),
 * así que un líder de proyecto o líder de un equipo asignado a él también
 * puede editarlos — mismo criterio que `SetProjectOvertimeAuthorizationUseCase`.
 */
@Injectable()
export class UpdateProjectExtrasUseCase implements UseCase<UpdateProjectExtrasCommand, void, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateProjectExtrasCommand): Promise<Result<void, ApplicationError>> {
    const { projectId, data, actor } = command;

    const project = await this.projects.findById(projectId);
    if (!project || project.isDeleted) return err(new ProjectNotFoundError(projectId));

    if (!command.actorPermissions.includes('projects:manage')) {
      const isLeader = await this.projects.isProjectLeaderOrTeamLeaderOfMember(project.id, actor.userId, null);
      if (!isLeader) return err(new CannotEditProjectExtrasError());
    }

    const updated = project.updateDetails(
      {
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
        ...(data.periodReportDate !== undefined
          ? { periodReportDate: data.periodReportDate ? new Date(data.periodReportDate) : null }
          : {}),
        ...(data.periodReportAchievements !== undefined
          ? { periodReportAchievements: data.periodReportAchievements }
          : {}),
      },
      this.clock.now(),
    );
    if (updated.isErr()) return err(updated.error);

    await this.projects.save(project);

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'project',
      entityId: project.id,
      metadata: { event: 'extras_updated' },
    });

    return ok(undefined);
  }
}
