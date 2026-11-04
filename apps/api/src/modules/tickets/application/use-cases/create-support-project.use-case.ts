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
import { Project } from '../../../projects/domain/entities/project.entity';
import { ProjectNameAlreadyInUseError } from '../../../projects/domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import { SupportPlan } from '../../domain/entities/support-plan.entity';
import {
  SupportPlanContactNotFoundError,
  SupportPlanRequiresClientError,
  InvalidSupportProjectRequestError,
} from '../../domain/errors/support-plan.errors';
import { ReferencedClientNotFoundError } from '../../domain/errors/ticket.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateSupportProjectCommand {
  readonly data: CreateProjectInput;
  readonly actor: ActorContext;
}

/**
 * Alta de un proyecto de soporte que trae su propio contrato completo (SLA,
 * tipo bolsa/mensual/demanda, valores) — para un cliente que contrata soporte
 * directamente, sin un proyecto de desarrollo terminado previo que
 * consolidar. Vive en el módulo de tickets (no en el de proyectos) porque
 * necesita `SUPPORT_PLAN_REPOSITORY`; importa el dominio de proyectos
 * directamente (mismo patrón ya usado por `ProjectsModuleTicketProjectReader`
 * para lecturas) en vez de reusar `CreateProjectUseCase`, que un caso de uso
 * no puede importar a otro (ver `architecture.spec.ts`).
 *
 * Distinto de `CreateSupportPlanUseCase`: ese vincula proyectos de desarrollo
 * YA TERMINADOS vía `support_plan_projects` (Único/Consolidado). Este crea un
 * proyecto nuevo y su plan enlazados directamente por `project_id` — el mismo
 * patrón que ya usan los 30 contratos legados migrados por el ETL.
 */
@Injectable()
export class CreateSupportProjectUseCase implements UseCase<CreateSupportProjectCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateSupportProjectCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor } = command;
    const now = this.clock.now();

    if (data.type !== 'support' || !data.supportPlanType) return err(new InvalidSupportProjectRequestError());
    if (!data.clientId) return err(new SupportPlanRequiresClientError());
    const client = await this.clients.findById(data.clientId);
    if (!client) return err(new ReferencedClientNotFoundError(data.clientId));

    if (await this.projects.nameIsTakenByAnother(data.name, data.clientId ?? null, null)) {
      return err(new ProjectNameAlreadyInUseError(data.name));
    }

    if (data.primaryContactId) {
      const contact = await this.clients.findContact(data.clientId, data.primaryContactId);
      if (!contact) return err(new SupportPlanContactNotFoundError(data.primaryContactId));
    }

    const slug = await withUniqueSuffix(slugify(data.name), async (candidate) => (await this.projects.findBySlug(candidate)) !== null);

    const createdProject = Project.create({
      id: this.ids.generate(),
      name: data.name,
      slug,
      clientId: data.clientId,
      type: 'support',
      priority: data.priority,
      leaderUserId: data.leaderUserId,
      startDate: data.startDate ? new Date(data.startDate) : null,
      estimatedDeliveryDate: data.estimatedDeliveryDate ? new Date(data.estimatedDeliveryDate) : null,
      // Las horas del plan al crear el soporte son las HH vendidas del proyecto (lo que muestran
      // listado, gráfico y dashboard); `supportHours` se mantiene sincronizado con el plan.
      soldHours: data.supportHours,
      supportHours: data.supportHours,
      quotationLink: data.quotationLink,
      contractLink: data.contractLink,
      additionalLinks: data.additionalLinks,
      status: 'active',
      now,
    });
    if (createdProject.isErr()) return err(createdProject.error);
    const project = createdProject.value;

    const planSlug = await withUniqueSuffix(slugify(data.name), async (candidate) => (await this.plans.findBySlug(candidate)) !== null);

    const createdPlan = SupportPlan.create({
      id: this.ids.generate(),
      clientId: data.clientId,
      slug: planSlug,
      projectId: project.id,
      scope: 'single',
      planType: data.supportPlanType!,
      surplusPolicy: data.supportSurplusPolicy,
      startDate: data.startDate ? new Date(data.startDate) : now,
      endDate: data.estimatedDeliveryDate ? new Date(data.estimatedDeliveryDate) : null,
      contractedHours: data.supportHours,
      planValueUf: data.supportPlanValueUf ?? 0,
      extraHourValueUf: data.supportExtraHourValueUf ?? 0,
      currency: data.supportCurrency,
      name: data.name,
      leaderUserId: data.leaderUserId,
      primaryContactId: data.primaryContactId,
      quotationLink: data.quotationLink,
      contractLink: data.contractLink,
      additionalLinks: data.additionalLinks,
      dueDayOfMonth: data.supportDueDayOfMonth,
      targetHoursCritical: data.supportTargetHoursCritical,
      targetHoursHigh: data.supportTargetHoursHigh,
      targetHoursMedium: data.supportTargetHoursMedium,
      targetHoursLow: data.supportTargetHoursLow,
      now,
    });
    if (createdPlan.isErr()) return err(createdPlan.error);
    const plan = createdPlan.value;

    try {
      await this.unitOfWork.run(async (tx) => {
        await this.projects.save(project, tx);
        await this.plans.save(plan, tx);

        if (data.supportPlanType === 'monthly') {
          await this.plans.createInitialPeriod(
            {
              id: this.ids.generate(),
              planId: plan.id,
              startDate: plan.startDate,
              endDate: addMonthsUtc(plan.startDate, 1),
              contractedHours: data.supportHours,
              surplusPolicy: data.supportSurplusPolicy ?? 'expire',
            },
            tx,
          );
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
      metadata: { name: data.name, type: 'support' },
    });
    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'support_plan',
      entityId: plan.id,
      metadata: { clientId: data.clientId, planType: data.supportPlanType, scope: 'single', projectId: project.id },
    });

    return ok({ id: project.id });
  }
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}
