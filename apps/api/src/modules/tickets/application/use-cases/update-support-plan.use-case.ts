import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, UNIT_OF_WORK, err, ok, type ApplicationError, type Clock, type Result, type UnitOfWork } from '@kora/core';
import type { UpdateSupportPlanInput } from '@kora/contracts';
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

    await this.unitOfWork.run(async (tx) => {
      await this.plans.save(plan, tx);
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
