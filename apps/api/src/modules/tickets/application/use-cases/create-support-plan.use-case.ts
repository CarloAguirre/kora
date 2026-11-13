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
import type { CreateSupportPlanInput } from '@kora/contracts';
import { Project } from '../../../projects/domain/entities/project.entity';
import { ProjectNameAlreadyInUseError } from '../../../projects/domain/errors/project.errors';
import { PROJECT_REPOSITORY, type ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import { SupportPlan } from '../../domain/entities/support-plan.entity';
import {
  SupportPlanContactNotFoundError,
  SupportPlanProjectClientMismatchError,
  SupportPlanProjectAlreadyLinkedError,
  SupportPlanProjectNotEligibleError,
  SupportPlanProjectNotFoundError,
} from '../../domain/errors/support-plan.errors';
import { ReferencedClientNotFoundError } from '../../domain/errors/ticket.errors';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { resolveSupportPlanName } from '../services/support-plan-naming';
import { AUDIT_RECORDER, type AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { isUniqueViolation } from '../../../../shared/infrastructure/database/postgres-errors';
import type { ActorContext, UseCase } from '../../../../shared/application/use-case';

export interface CreateSupportPlanCommand {
  readonly data: CreateSupportPlanInput;
  readonly actor: ActorContext;
}

/**
 * Alta de un contrato de soporte que vincula proyecto(s) de desarrollo YA
 * TERMINADOS: 1 proyecto = `scope='single'`, 2+ = `'consolidated'` (comparten
 * una sola bolsa de horas y una sola facturación — ver
 * docs/DECISION-M5-TICKETS.md sobre `soporte_proyecto`, que este enlace
 * retoma).
 *
 * Además crea el proyecto "contenedor" de soporte del contrato
 * (`support_plans.project_id`), igual que los contratos legados y
 * `CreateSupportProjectUseCase`. Antes no lo creaba, y el contrato quedaba
 * fuera de todo lo que lista proyectos de soporte (Proyectos → Soporte,
 * dashboard, ficha de cliente, selector de proyecto del ticket). Los tickets
 * se abren contra el contenedor y el proyecto cubierto va en "Proyecto de
 * desarrollo"; el consumo suma ambos (ver `resolveSupportPlanHourProjectIds`).
 */
@Injectable()
export class CreateSupportPlanUseCase implements UseCase<CreateSupportPlanCommand, { id: string }, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(PROJECT_REPOSITORY) private readonly projectRepository: ProjectRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    @Inject(UNIT_OF_WORK) private readonly unitOfWork: UnitOfWork,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateSupportPlanCommand): Promise<Result<{ id: string }, ApplicationError>> {
    const { data, actor } = command;
    const now = this.clock.now();

    const client = await this.clients.findById(data.clientId);
    if (!client) return err(new ReferencedClientNotFoundError(data.clientId));

    const eligibility = await this.validateProjects(data.clientId, data.developmentProjectIds);
    if (eligibility.isErr()) return err(eligibility.error);
    const eligibleProjects = eligibility.value;

    if (data.primaryContactId) {
      const contact = await this.clients.findContact(data.clientId, data.primaryContactId);
      if (!contact) return err(new SupportPlanContactNotFoundError(data.primaryContactId));
    }

    const scope = data.developmentProjectIds.length > 1 ? 'consolidated' : 'single';
    const name = resolveSupportPlanName(data.name?.trim() || null, scope, eligibleProjects.map((p) => p.name), client.companyName);
    const slug = await withUniqueSuffix(slugify(name), async (candidate) => (await this.plans.findBySlug(candidate)) !== null);
    const startDate = new Date(data.startDate);
    const endDate = data.endDate ? new Date(data.endDate) : null;

    if (await this.projectRepository.nameIsTakenByAnother(name, data.clientId, null)) {
      return err(new ProjectNameAlreadyInUseError(name));
    }
    const projectSlug = await withUniqueSuffix(slugify(name), async (candidate) => (await this.projectRepository.findBySlug(candidate)) !== null);
    const createdProject = Project.create({
      id: this.ids.generate(),
      name,
      slug: projectSlug,
      clientId: data.clientId,
      type: 'support',
      leaderUserId: data.leaderUserId,
      startDate,
      estimatedDeliveryDate: endDate,
      // Las horas contratadas al crear el contrato son las HH vendidas del proyecto (lo que muestran
      // listado, gráfico y dashboard); `supportHours` se mantiene sincronizado con el plan.
      soldHours: data.contractedHours,
      supportHours: data.contractedHours,
      quotationLink: data.quotationLink,
      contractLink: data.contractLink,
      additionalLinks: data.additionalLinks,
      status: 'active',
      now,
    });
    if (createdProject.isErr()) return err(createdProject.error);
    const project = createdProject.value;
    const dueDayOfMonth =
      data.dueDayOfMonth ?? (data.planType === 'monthly' && data.surplusPolicy === 'expire' ? startDate.getUTCDate() : null);

    const created = SupportPlan.create({
      id: this.ids.generate(),
      clientId: data.clientId,
      slug,
      projectId: project.id,
      scope,
      planType: data.planType,
      surplusPolicy: data.surplusPolicy,
      startDate,
      endDate,
      contractedHours: data.contractedHours,
      planValueUf: data.planValueUf,
      extraHourValueUf: data.extraHourValueUf,
      currency: data.currency,
      name,
      leaderUserId: data.leaderUserId,
      primaryContactId: data.primaryContactId,
      quotationLink: data.quotationLink,
      contractLink: data.contractLink,
      additionalLinks: data.additionalLinks,
      dueDayOfMonth,
      targetHoursCritical: data.targetHoursCritical,
      targetHoursHigh: data.targetHoursHigh,
      targetHoursMedium: data.targetHoursMedium,
      targetHoursLow: data.targetHoursLow,
      now,
    });
    if (created.isErr()) return err(created.error);
    const plan = created.value;

    try {
      await this.unitOfWork.run(async (tx) => {
        await this.projectRepository.save(project, tx);
        await this.plans.save(plan, tx);
        await this.plans.linkProjects(plan.id, data.developmentProjectIds, tx);

        if (data.planType === 'monthly') {
          await this.plans.createInitialPeriod(
            {
              id: this.ids.generate(),
              planId: plan.id,
              startDate,
              endDate: addMonthsUtc(startDate, 1),
              contractedHours: data.contractedHours,
              surplusPolicy: data.surplusPolicy ?? 'expire',
            },
            tx,
          );
        }
      });
    } catch (error) {
      if (isUniqueViolation(error)) return err(new ProjectNameAlreadyInUseError(name));
      throw error;
    }

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'project',
      entityId: project.id,
      metadata: { name, type: 'support', supportPlanId: plan.id },
    });

    await this.audit.record({
      actor: { userId: actor.userId, email: actor.email },
      action: 'create',
      entityType: 'support_plan',
      entityId: plan.id,
      metadata: { clientId: data.clientId, planType: data.planType, scope, projectCount: data.developmentProjectIds.length, projectId: project.id },
    });

    return ok({ id: plan.id });
  }

  private async validateProjects(
    clientId: string,
    developmentProjectIds: readonly string[],
  ): Promise<
    Result<
      { id: string; name: string }[],
      SupportPlanProjectNotFoundError | SupportPlanProjectNotEligibleError | SupportPlanProjectClientMismatchError | SupportPlanProjectAlreadyLinkedError
    >
  > {
    const found = await this.projects.findManyByIds(developmentProjectIds);
    const byId = new Map(found.map((project) => [project.id, project]));

    const alreadyLinked = new Set(await this.plans.findProjectIdsAlreadyLinked(developmentProjectIds));

    const eligible: { id: string; name: string }[] = [];
    for (const id of developmentProjectIds) {
      const project = byId.get(id);
      if (!project) return err(new SupportPlanProjectNotFoundError(id));
      if (project.type !== 'development' || project.status !== 'finished') {
        return err(new SupportPlanProjectNotEligibleError(project.name));
      }
      if (project.clientId !== clientId) return err(new SupportPlanProjectClientMismatchError(project.name));
      if (alreadyLinked.has(id)) return err(new SupportPlanProjectAlreadyLinkedError(project.name));
      eligible.push({ id: project.id, name: project.name });
    }
    return ok(eligible);
  }
}

function addMonthsUtc(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}
