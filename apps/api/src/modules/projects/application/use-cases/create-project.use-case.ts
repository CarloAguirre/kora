import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  ID_GENERATOR,
  UNIT_OF_WORK,
  err,
  ok,
  type ApplicationError,
  type Clock,
  type IdGenerator,
  type Result,
  type UnitOfWork,
} from '@kora/core';
import { slugify, withUniqueSuffix } from '@kora/core';
import type { CreateProjectInput } from '@kora/contracts';
import { Project } from '../../domain/entities/project.entity';
import { ProjectNameAlreadyInUseError, ReferencedClientNotFoundError } from '../../domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../domain/repositories/project.repository';
import { PROJECT_TEAM_REPOSITORY, type ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import {
  PROJECT_PAYMENT_MILESTONE_REPOSITORY,
  type ProjectPaymentMilestoneRepository,
} from '../../domain/repositories/project-payment-milestone.repository';
import { PROJECT_CLIENT_READER, type ProjectClientReader } from '../ports/project-client-reader.port';
import { PaymentMilestoneTriggerService, type PromotedPaymentMilestone } from '../services/payment-milestone-trigger.service';
import { syncPaymentPlan } from '../services/payment-plan-sync';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateProjectCommand {
  readonly data: CreateProjectInput;
  readonly actor: ActorContext;
}

/**
 * Cronograma de cobro mínimo con el que nace todo proyecto de desarrollo cuando el formulario no manda
 * plan de pago: Inicio al aprobarse y Marcha blanca al entrar en esa fase. El monto sale del monto del
 * contrato si se informó; si no, parte en 0 y se completa a mano.
 */
function defaultPaymentPlan(contractAmount: number | null | undefined) {
  const half = contractAmount ? Math.round(contractAmount * 50) / 100 : 0;
  return [
    { name: 'Inicio', percent: 50, amount: half, sortOrder: 0, triggerType: 'approval' as const },
    { name: 'Marcha blanca', percent: 50, amount: half, sortOrder: 1, triggerType: 'phase' as const, triggerPhase: 'pilot' as const },
  ];
}

@Injectable()
export class CreateProjectUseCase
  implements UseCase<CreateProjectCommand, { id: string }, ApplicationError>
{
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(PROJECT_TEAM_REPOSITORY) private readonly projectTeams: ProjectTeamRepository,
    @Inject(PROJECT_PAYMENT_MILESTONE_REPOSITORY) private readonly paymentMilestones: ProjectPaymentMilestoneRepository,
    @Inject(PROJECT_CLIENT_READER) private readonly clients: ProjectClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly paymentTriggers: PaymentMilestoneTriggerService,
  ) {}

  async execute(command: CreateProjectCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor } = command;

    if (data.clientId) {
      const client = await this.clients.findById(data.clientId);
      if (!client) return err(new ReferencedClientNotFoundError(data.clientId));
    }

    if (await this.projects.nameIsTakenByAnother(data.name, data.clientId ?? null, null)) {
      return err(new ProjectNameAlreadyInUseError(data.name));
    }

    const slug = await withUniqueSuffix(slugify(data.name), async (candidate) => (await this.projects.findBySlug(candidate)) !== null);

    const created = Project.create({
      id: this.ids.generate(),
      name: data.name,
      slug,
      clientId: data.clientId,
      type: data.type,
      salesStage: data.salesStage,
      priority: data.priority,
      leaderUserId: data.leaderUserId,
      developerUserId: data.developerUserId,
      commercialManagerUserId: data.commercialManagerUserId,
      startDate: data.startDate ? new Date(data.startDate) : null,
      estimatedDeliveryDate: data.estimatedDeliveryDate ? new Date(data.estimatedDeliveryDate) : null,
      soldHours: data.soldHours,
      supportPlanDescription: data.supportPlanDescription,
      supportHours: data.supportHours,
      quotationLink: data.quotationLink,
      contractLink: data.contractLink,
      additionalLinks: data.additionalLinks,
      contractAmount: data.contractAmount ?? null,
      ...(data.contractCurrency ? { contractCurrency: data.contractCurrency } : {}),
      phase: data.phase,
      status: data.status,
      now: this.clock.now(),
    });
    if (created.isErr()) return err(created.error);
    const project = created.value;

    let promoted: PromotedPaymentMilestone[] = [];
    try {
      await this.unitOfWork.run(async (tx) => {
        await this.projects.save(project, tx);
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
        if (project.type === 'development') {
          await syncPaymentPlan(
            this.paymentMilestones,
            project.id,
            data.paymentMilestones ?? defaultPaymentPlan(data.contractAmount),
            this.paymentTriggers.readinessOf(project),
            tx,
          );
          // Un proyecto que nace aprobado (o en una fase/fecha ya cumplida) deja sus tramos por facturar de inmediato.
          promoted = await this.paymentTriggers.promote(project, tx);
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) return err(new ProjectNameAlreadyInUseError(data.name));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'project',
      entityId: project.id,
      metadata: { name: data.name, type: data.type },
    });

    await this.paymentTriggers.notify(project, promoted);

    return ok({ id: project.id });
  }
}
