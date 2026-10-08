import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { UpdateSupportPlanInput } from '@kora/contracts';
import type { Project } from '../../../projects/domain/entities/project.entity';
import { ProjectNameAlreadyInUseError } from '../../../projects/domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import {
  SupportPlanContactNotFoundError,
  SupportPlanNotFoundError,
  SupportPlanProjectAlreadyLinkedError,
  SupportPlanProjectClientMismatchError,
  SupportPlanProjectNotEligibleError,
  SupportPlanProjectNotFoundError,
} from '../../domain/errors/support-plan.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface UpdateSupportPlanCommand {
  readonly planId: string;
  readonly data: UpdateSupportPlanInput;
  readonly actor: ActorContext;
}

@Injectable()
export class UpdateSupportPlanUseCase implements UseCase<UpdateSupportPlanCommand, void, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepository: ProjectRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateSupportPlanCommand): Promise<Result<void, ApplicationError>> {
    const { planId, data, actor } = command;
    const now = this.clock.now();

    const plan = await this.plans.findById(planId);
    if (!plan) return err(new SupportPlanNotFoundError(planId));

    if (data.primaryContactId) {
      const contact = await this.clients.findContact(plan.clientId, data.primaryContactId);
      if (!contact) return err(new SupportPlanContactNotFoundError(data.primaryContactId));
    }

    let newScope: 'single' | 'consolidated' | undefined;
    if (data.developmentProjectIds) {
      const validated = await this.validateProjects(plan.clientId, planId, data.developmentProjectIds);
      if (validated.isErr()) return err(validated.error);
      newScope = data.developmentProjectIds.length > 1 ? 'consolidated' : 'single';
    }

    const updated = plan.update(
      {
        ...(newScope ? { scope: newScope } : {}),
        ...(data.planType !== undefined ? { planType: data.planType } : {}),
        ...(data.surplusPolicy !== undefined ? { surplusPolicy: data.surplusPolicy ?? null } : {}),
        ...(data.startDate !== undefined ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
        ...(data.contractedHours !== undefined ? { contractedHours: data.contractedHours } : {}),
        ...(data.planValueUf !== undefined ? { planValueUf: data.planValueUf } : {}),
        ...(data.extraHourValueUf !== undefined ? { extraHourValueUf: data.extraHourValueUf } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.leaderUserId !== undefined ? { leaderUserId: data.leaderUserId ?? null } : {}),
        ...(data.primaryContactId !== undefined ? { primaryContactId: data.primaryContactId ?? null } : {}),
        ...(data.quotationLink !== undefined ? { quotationLink: data.quotationLink ?? null } : {}),
        ...(data.contractLink !== undefined ? { contractLink: data.contractLink ?? null } : {}),
        ...(data.additionalLinks !== undefined ? { additionalLinks: data.additionalLinks ?? null } : {}),
        ...(data.dueDayOfMonth !== undefined ? { dueDayOfMonth: data.dueDayOfMonth ?? null } : {}),
        ...(data.targetHoursCritical !== undefined ? { targetHoursCritical: data.targetHoursCritical ?? null } : {}),
        ...(data.targetHoursHigh !== undefined ? { targetHoursHigh: data.targetHoursHigh ?? null } : {}),
        ...(data.targetHoursMedium !== undefined ? { targetHoursMedium: data.targetHoursMedium ?? null } : {}),
        ...(data.targetHoursLow !== undefined ? { targetHoursLow: data.targetHoursLow ?? null } : {}),
      },
      now,
    );
    if (updated.isErr()) return err(updated.error);

    const container = await this.syncContainerProject(plan.projectId, plan.clientId, data, now);
    if (container.isErr()) return err(container.error);

    await this.unitOfWork.run(async (tx) => {
      await this.plans.save(plan, tx);
      if (container.value) await this.projectRepository.save(container.value, tx);
      if (data.developmentProjectIds) await this.plans.linkProjects(planId, data.developmentProjectIds, tx);
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'update',
      entityType: 'support_plan',
      entityId: plan.id,
      metadata: {},
    });

    return ok(undefined);
  }

  /**
   * Lleva al proyecto "contenedor" de soporte (`plan.projectId`) los datos del
   * contrato que también se ven en los listados de proyectos — sin esto,
   * Proyectos → Soporte y el dashboard mostrarían el nombre, líder, fechas u
   * horas de cuando se creó el contrato. Solo los campos que vienen en `data`.
   */
  private async syncContainerProject(
    projectId: string | null,
    clientId: string,
    data: UpdateSupportPlanInput,
    now: Date,
  ): Promise<Result<Project | null, ProjectNameAlreadyInUseError>> {
    if (!projectId) return ok(null);
    const project = await this.projectRepository.findById(projectId);
    if (!project || project.isDeleted || project.type !== 'support') return ok(null);

    const name = data.name?.trim();
    if (name && name !== project.name && (await this.projectRepository.nameIsTakenByAnother(name, clientId, project.id))) {
      return err(new ProjectNameAlreadyInUseError(name));
    }

    project.updateDetails(
      {
        ...(name ? { name } : {}),
        ...(data.leaderUserId !== undefined ? { leaderUserId: data.leaderUserId ?? null } : {}),
        ...(data.startDate !== undefined ? { startDate: new Date(data.startDate) } : {}),
        ...(data.endDate !== undefined ? { estimatedDeliveryDate: data.endDate ? new Date(data.endDate) : null } : {}),
        ...(data.contractedHours !== undefined ? { supportHours: data.contractedHours } : {}),
        ...(data.quotationLink !== undefined ? { quotationLink: data.quotationLink ?? null } : {}),
        ...(data.contractLink !== undefined ? { contractLink: data.contractLink ?? null } : {}),
      },
      now,
    );
    return ok(project);
  }

  private async validateProjects(
    clientId: string,
    planId: string,
    developmentProjectIds: readonly string[],
  ): Promise<
    Result<
      void,
      SupportPlanProjectNotFoundError | SupportPlanProjectNotEligibleError | SupportPlanProjectClientMismatchError | SupportPlanProjectAlreadyLinkedError
    >
  > {
    const found = await this.projects.findManyByIds(developmentProjectIds);
    const byId = new Map(found.map((project) => [project.id, project]));
    const alreadyLinked = new Set(await this.plans.findProjectIdsAlreadyLinked(developmentProjectIds, planId));

    for (const id of developmentProjectIds) {
      const project = byId.get(id);
      if (!project) return err(new SupportPlanProjectNotFoundError(id));
      if (project.type !== 'development' || project.status !== 'finished') {
        return err(new SupportPlanProjectNotEligibleError(project.name));
      }
      if (project.clientId !== clientId) return err(new SupportPlanProjectClientMismatchError(project.name));
      if (alreadyLinked.has(id)) return err(new SupportPlanProjectAlreadyLinkedError(project.name));
    }
    return ok(undefined);
  }
}
