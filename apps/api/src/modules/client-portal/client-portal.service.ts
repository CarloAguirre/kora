import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and, clientContacts, clientPortalAccounts, clientPortalDeliveryReceipts,
  clientPortalProjectGrants, clientPortalSupportGrants, clients, eq, inArray,
  isNull, projectModuleDeliveries, projectModules, projects, roles, sql,
  supportPlans, tickets, users, type Database,
} from '@kora/db';
import type { ProjectDetail, SupportPlanWithInvoices } from '@kora/contracts';
import { DATABASE } from '../../shared/infrastructure/database/database.module';
import { unwrapOrThrow } from '../../shared/presentation/unwrap-result';
import { GetProjectUseCase } from '../projects/application/use-cases/get-project.use-case';
import { GetSupportPlanUseCase } from '../tickets/application/use-cases/get-support-plan.use-case';
import { CreateUserUseCase } from '../users/application/use-cases/create-user.use-case';
import type { RequestUser } from '../../shared/presentation/decorators/current-user.decorator';

export interface ClientPortalGrantInput {
  readonly enabled: boolean;
  readonly projectIds: string[];
  readonly supportPlanIds: string[];
}

type PortalActor = Pick<RequestUser, 'id' | 'email' | 'role'>;
type PortalAccount = { userId: string; clientId: string; contactId: string; contactName: string; contactPosition: string | null; companyName: string; logoUrl: string | null };

@Injectable()
export class ClientPortalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly getProjectUseCase: GetProjectUseCase,
    private readonly getSupportPlanUseCase: GetSupportPlanUseCase,
    private readonly createUser: CreateUserUseCase,
  ) {}

  private async requireAccount(actor: PortalActor): Promise<PortalAccount> {
    if (actor.role !== 'cliente') throw new ForbiddenException('Solo un usuario de perfil cliente puede acceder al portal externo.');
    const rows = await this.db
      .select({
        userId: clientPortalAccounts.userId,
        clientId: clientPortalAccounts.clientId,
        contactId: clientPortalAccounts.contactId,
        contactName: clientContacts.name,
        contactPosition: clientContacts.position,
        companyName: clients.companyName,
        logoUrl: clients.logoDataUrl,
      })
      .from(clientPortalAccounts)
      .innerJoin(clientContacts, eq(clientContacts.id, clientPortalAccounts.contactId))
      .innerJoin(clients, eq(clients.id, clientPortalAccounts.clientId))
      .innerJoin(users, eq(users.id, clientPortalAccounts.userId))
      .where(and(
        eq(clientPortalAccounts.userId, actor.id),
        eq(clientPortalAccounts.enabled, true),
        eq(clients.status, 'active'),
        isNull(clients.deletedAt),
        eq(users.status, 'active'),
        isNull(users.deletedAt),
        sql`lower(btrim(${users.email})) = lower(btrim(${clientContacts.email}))`,
        eq(clientContacts.clientId, clientPortalAccounts.clientId),
      ))
      .limit(1);
    if (!rows[0]) throw new ForbiddenException('Este contacto no tiene acceso activo al portal.');
    return rows[0];
  }

  async listClientContactAccess(clientId: string) {
    const rows = await this.db
      .select({
        userId: clientPortalAccounts.userId, clientId: clientPortalAccounts.clientId,
        contactId: clientPortalAccounts.contactId, enabled: clientPortalAccounts.enabled,
        email: users.email,
      })
      .from(clientPortalAccounts)
      .innerJoin(users, eq(users.id, clientPortalAccounts.userId))
      .where(eq(clientPortalAccounts.clientId, clientId));
    return Promise.all(rows.map(async (row) => {
      const [projectGrants, planGrants] = await Promise.all([
        this.db.select({ id: clientPortalProjectGrants.projectId })
          .from(clientPortalProjectGrants).where(eq(clientPortalProjectGrants.userId, row.userId)),
        this.db.select({ id: clientPortalSupportGrants.planId })
          .from(clientPortalSupportGrants).where(eq(clientPortalSupportGrants.userId, row.userId)),
      ]);
      return { ...row, projectIds: projectGrants.map((grant) => grant.id), supportPlanIds: planGrants.map((grant) => grant.id) };
    }));
  }

  /** Solo admin/PMO; se invoca desde ficha de un CONTACTO, nunca desde el portal externo. */
  async setClientContactAccess(clientId: string, contactId: string, input: ClientPortalGrantInput, actor: PortalActor) {
    const [contact] = await this.db
      .select({ id: clientContacts.id, name: clientContacts.name, email: clientContacts.email, clientId: clientContacts.clientId })
      .from(clientContacts)
      .innerJoin(clients, eq(clients.id, clientContacts.clientId))
      .where(and(eq(clientContacts.id, contactId), eq(clientContacts.clientId, clientId),
        eq(clients.status, 'active'), isNull(clients.deletedAt)))
      .limit(1);
    if (!contact || !contact.email?.trim()) throw new BadRequestException('El contacto debe existir, estar activo y tener correo electrónico.');

    const uniqueProjects = [...new Set(input.projectIds)];
    const uniquePlans = [...new Set(input.supportPlanIds)];
    if (uniqueProjects.length !== input.projectIds.length || uniquePlans.length !== input.supportPlanIds.length)
      throw new BadRequestException('No repitas proyectos o contratos.');

    const [validProjects, validPlans] = await Promise.all([
      uniqueProjects.length ? this.db.select({ id: projects.id })
        .from(projects).where(and(inArray(projects.id, uniqueProjects), eq(projects.clientId, clientId),
          eq(projects.type, 'development'), eq(projects.isInternal, false), isNull(projects.deletedAt))) : Promise.resolve([]),
      uniquePlans.length ? this.db.select({ id: supportPlans.id })
        .from(supportPlans).where(and(inArray(supportPlans.id, uniquePlans), eq(supportPlans.clientId, clientId))) : Promise.resolve([]),
    ]);
    if (validProjects.length !== uniqueProjects.length || validPlans.length !== uniquePlans.length)
      throw new BadRequestException('Solo puedes conceder proyectos y contratos pertenecientes al mismo cliente.');

    const [existing] = await this.db.select({ id: users.id, email: users.email, role: roles.code })
      .from(users).innerJoin(roles, eq(roles.id, users.roleId))
      .where(and(sql`lower(btrim(${users.email})) = ${contact.email.trim().toLowerCase()}`, isNull(users.deletedAt)))
      .limit(1);
    if (existing && existing.role !== 'cliente')
      throw new ConflictException('El correo pertenece a un usuario interno. No se pueden convertir sus permisos al portal.');
    const [linkedToAnother] = existing ? await this.db.select({ clientId: clientPortalAccounts.clientId })
      .from(clientPortalAccounts).where(eq(clientPortalAccounts.userId, existing.id)).limit(1) : [];
    if (linkedToAnother && linkedToAnother.clientId !== clientId)
      throw new ConflictException('Este usuario ya tiene acceso al portal de otra empresa.');

    let userId = existing?.id;
    let invitationSent = false;
    if (!userId) {
      const [firstName, ...lastName] = contact.name.trim().split(/\s+/);
      const created = unwrapOrThrow(await this.createUser.execute({
        data: { email: contact.email.trim(), firstName: firstName ?? 'Contacto', lastName: lastName.join(' ') || 'Cliente', role: 'cliente',
          teamId: null, isCommercialManager: false, grantAccess: true },
        actor: { userId: actor.id, email: actor.email },
      }));
      userId = created.userId;
      invitationSent = created.invitationSent;
    }

    // Una única transacción reemplaza grants. Revocación efectiva sin depender de JWT/caché.
    await this.db.transaction(async (tx) => {
      await tx.insert(clientPortalAccounts)
        .values({ userId, clientId, contactId, enabled: input.enabled, updatedBy: actor.id })
        .onConflictDoUpdate({
          target: clientPortalAccounts.userId,
          set: { contactId, enabled: input.enabled, updatedBy: actor.id, updatedAt: new Date() },
        });
      await tx.delete(clientPortalProjectGrants).where(eq(clientPortalProjectGrants.userId, userId));
      await tx.delete(clientPortalSupportGrants).where(eq(clientPortalSupportGrants.userId, userId));
      if (input.enabled && uniqueProjects.length)
        await tx.insert(clientPortalProjectGrants).values(uniqueProjects.map((projectId) => ({ userId, projectId })));
      if (input.enabled && uniquePlans.length)
        await tx.insert(clientPortalSupportGrants).values(uniquePlans.map((planId) => ({ userId, planId })));
    });
    return { userId, invitationSent, enabled: input.enabled, projectIds: input.enabled ? uniqueProjects : [],
      supportPlanIds: input.enabled ? uniquePlans : [] };
  }

  async me(actor: PortalActor) {
    const account = await this.requireAccount(actor);
    return { company: { name: account.companyName, contactName: account.contactName,
      contactPosition: account.contactPosition ?? '', logoUrl: account.logoUrl } };
  }

  private async requireProject(actor: PortalActor, idOrSlug: string): Promise<{ account: PortalAccount; projectId: string }> {
    const account = await this.requireAccount(actor);
    const [match] = await this.db.select({ id: projects.id })
      .from(clientPortalProjectGrants)
      .innerJoin(projects, eq(projects.id, clientPortalProjectGrants.projectId))
      .where(and(
        eq(clientPortalProjectGrants.userId, actor.id), eq(projects.clientId, account.clientId),
        eq(projects.type, 'development'), eq(projects.isInternal, false),
        isNull(projects.deletedAt),
        sql`(${projects.id}::text = ${idOrSlug} or ${projects.slug} = ${idOrSlug})`,
      )).limit(1);
    if (!match) throw new NotFoundException('Proyecto no disponible en este portal.');
    return { account, projectId: match.id };
  }

  private async requirePlan(actor: PortalActor, idOrSlug: string) {
    const account = await this.requireAccount(actor);
    const [match] = await this.db.select({ id: supportPlans.id })
      .from(clientPortalSupportGrants)
      .innerJoin(supportPlans, eq(supportPlans.id, clientPortalSupportGrants.planId))
      .where(and(eq(clientPortalSupportGrants.userId, actor.id), eq(supportPlans.clientId, account.clientId),
        sql`(${supportPlans.id}::text = ${idOrSlug} or ${supportPlans.slug} = ${idOrSlug})`))
      .limit(1);
    if (!match) throw new NotFoundException('Contrato no disponible en este portal.');
    return { account, planId: match.id };
  }

  private async projectForPortal(actor: PortalActor, projectId: string) {
    // La autorización de grant ocurre ANTES de usar la agregación interna.
    const result = unwrapOrThrow(await this.getProjectUseCase.execute({
      projectId, actorUserId: actor.id, actorPermissions: ['projects:read'],
    }));
    return result;
  }

  private publicProject(project: ProjectDetail) {
    // Whitelist: jamás exponer miembros, comentarios internos de horas,
    // auditoría, facturas adjuntas ni motivos de rechazo de líderes.
    return {
      id: project.id, slug: project.slug, name: project.name, status: project.status,
      salesStage: project.salesStage, phase: project.phase, startDate: project.startDate,
      endDate: project.endDate, client: project.client,
      primaryContact: project.primaryContact ? {
        name: project.primaryContact.name, position: project.primaryContact.position,
      } : null,
      commercialManager: project.commercialManager ? { fullName: project.commercialManager.fullName } : null,
      leader: project.leader ? { fullName: project.leader.fullName } : null,
      soldHours: project.soldHours, usedHours: project.usedHours,
      usedHoursUpdatedAt: project.usedHoursUpdatedAt, leaderLastActivityAt: project.leaderLastActivityAt,
      progress: project.progress, contractCurrency: project.contractCurrency,
      paymentMilestones: project.paymentMilestones.map((m) => ({
        name: m.name, amount: m.amount, percent: m.percent, status: m.status,
        invoiceNumber: m.invoiceNumber, issuedAt: m.issuedAt, paidAt: m.paidAt,
      })),
      modules: project.modules.map((m) => ({
        id: m.id, name: m.name, currentStage: m.currentStage,
        estimatedStartDate: m.estimatedStartDate, estimatedEndDate: m.estimatedEndDate,
        blockerCount: m.blockerCount, progress: { scopes: m.progress.scopes },
        segments: m.segments.map((s) => ({
          id: s.id, teamName: s.teamName, name: s.name, startDate: s.startDate, endDate: s.endDate,
        })),
        tasks: m.tasks.map((t) => ({
          id: t.id, name: t.name, startDate: t.startDate, date: t.date, scope: t.scope, status: t.status,
        })),
        deliveries: m.deliveries.map((d) => ({
          id: d.id, name: d.name, teamName: d.teamName, estimatedDate: d.estimatedDate,
          // 'delivered' se mantiene en revisión interna: NO equivale a entregado al cliente.
          status: d.status === 'approved' ? 'approved' : 'planned',
        })),
      })),
      // Ningún comentario/hora interna se divulga por defecto.
      observations: [],
      demoLink: project.demoLink, testEnvironmentLink: project.testEnvironmentLink,
      figmaLink: project.figmaLink, documentationLink: project.documentationLink,
      impactBeforeHours: project.impactBeforeHours,
      impactBeforePeople: project.impactBeforePeople,
      impactBeforeDuration: project.impactBeforeDuration,
      impactBeforeModality: project.impactBeforeModality,
      impactAfterHours: project.impactAfterHours,
      impactAfterPeople: project.impactAfterPeople,
      impactAfterDuration: project.impactAfterDuration,
      impactAfterModality: project.impactAfterModality,
      qaTestingStartDate: project.qaTestingStartDate,
      qaTestingEndDate: project.qaTestingEndDate,
      qaEvaluatedModule: project.qaEvaluatedModule, qaPlannedTests: project.qaPlannedTests,
      qaExecutedTests: project.qaExecutedTests, qaFailedTests: project.qaFailedTests,
    };
  }

  async listProjects(actor: PortalActor) {
    const account = await this.requireAccount(actor);
    const grants = await this.db.select({ id: projects.id }).from(clientPortalProjectGrants)
      .innerJoin(projects, eq(projects.id, clientPortalProjectGrants.projectId))
      .where(and(eq(clientPortalProjectGrants.userId, actor.id), eq(projects.clientId, account.clientId),
        eq(projects.type, 'development'), eq(projects.isInternal, false), isNull(projects.deletedAt)));
    const projectsForPortal = await Promise.all(grants.map(async (grant) =>
      this.publicProject(await this.projectForPortal(actor, grant.id))));
    return projectsForPortal.map((project) => ({
      id: project.id, slug: project.slug, name: project.name, status: project.status,
      salesStage: project.salesStage, phase: project.phase, leader: project.leader,
      startDate: project.startDate, endDate: project.endDate, progress: project.progress,
    }));
  }

  async getProject(actor: PortalActor, idOrSlug: string) {
    const { projectId } = await this.requireProject(actor, idOrSlug);
    const project = this.publicProject(await this.projectForPortal(actor, projectId));
    const receipts = await this.db.select({
      deliveryId: clientPortalDeliveryReceipts.deliveryId,
      receivedAt: clientPortalDeliveryReceipts.receivedAt,
      receivedByName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
    }).from(clientPortalDeliveryReceipts)
      .innerJoin(users, eq(users.id, clientPortalDeliveryReceipts.receivedByUserId))
      .where(eq(clientPortalDeliveryReceipts.projectId, projectId));
    return { project, receipts: receipts.map((r) => ({ ...r, receivedAt: r.receivedAt.toISOString() })) };
  }

  async receiveDelivery(actor: PortalActor, idOrSlug: string, deliveryId: string) {
    const { account, projectId } = await this.requireProject(actor, idOrSlug);
    const [delivery] = await this.db
      .select({ id: projectModuleDeliveries.id, status: projectModuleDeliveries.status })
      .from(projectModuleDeliveries)
      .innerJoin(projectModules, eq(projectModules.id, projectModuleDeliveries.moduleId))
      .where(and(eq(projectModuleDeliveries.id, deliveryId), eq(projectModules.projectId, projectId))).limit(1);
    if (!delivery) throw new NotFoundException('Entrega no disponible en el proyecto.');
    if (delivery.status !== 'approved') throw new BadRequestException('La entrega debe estar aprobada internamente antes de enviarse al cliente.');
    const inserted = await this.db.insert(clientPortalDeliveryReceipts)
      .values({ deliveryId, projectId, clientId: account.clientId, receivedByUserId: actor.id })
      .onConflictDoNothing().returning({ deliveryId: clientPortalDeliveryReceipts.deliveryId });
    if (!inserted.length) throw new ConflictException('La recepción de esta entrega ya fue confirmada.');
    return { deliveryId, received: true };
  }

  async listSupportPlans(actor: PortalActor) {
    const account = await this.requireAccount(actor);
    const grants = await this.db.select({ id: supportPlans.id }).from(clientPortalSupportGrants)
      .innerJoin(supportPlans, eq(supportPlans.id, clientPortalSupportGrants.planId))
      .where(and(eq(clientPortalSupportGrants.userId, actor.id), eq(supportPlans.clientId, account.clientId)));
    return Promise.all(grants.map(async (row) => {
      const plan = unwrapOrThrow(await this.getSupportPlanUseCase.execute({ planId: row.id }));
      return this.publicSupportPlan(plan);
    }));
  }

  private publicSupportPlan(plan: SupportPlanWithInvoices) {
    return {
      id: plan.id, slug: plan.slug, name: plan.name, status: plan.status,
      planType: plan.planType, scope: plan.scope,
      clientId: plan.clientId, clientName: plan.clientName,
      startDate: plan.startDate, endDate: plan.endDate,
      currency: plan.currency, leaderName: plan.leaderName,
      contact: plan.contact ? { name: plan.contact.name, position: plan.contact.position } : null,
      linkedProjects: plan.linkedProjects.map((p) => ({ id: p.id, name: p.name })),
      summary: {
        contractedHours: plan.summary.contractedHours, usedHours: plan.summary.usedHours,
        planValueUf: plan.summary.planValueUf, extraHourValueUf: plan.summary.extraHourValueUf,
      },
    };
  }

  async getSupportPlan(actor: PortalActor, idOrSlug: string) {
    const { account, planId } = await this.requirePlan(actor, idOrSlug);
    const rawPlan = unwrapOrThrow(await this.getSupportPlanUseCase.execute({ planId }));
    const plan = this.publicSupportPlan(rawPlan);
    // Aislamiento CRÍTICO: filtrar por proyecto contenedor del contrato, NO
    // por clientId genérico (un cliente puede tener varios contratos).
    const rows = rawPlan.projectId ? await this.db.select({
      id: tickets.id, code: tickets.legacyId, title: tickets.title,
      description: tickets.description, serviceType: tickets.serviceType,
      status: tickets.status, priority: tickets.priority, usedHours: tickets.usedHours,
      estimatedHours: tickets.estimatedHours, resolvedAt: tickets.resolvedAt,
      resolution: tickets.resolution, createdAt: tickets.createdAt,
      developmentProjectId: tickets.developmentProjectId,
    }).from(tickets).where(and(eq(tickets.projectId, rawPlan.projectId),
      eq(tickets.clientId, account.clientId), isNull(tickets.deletedAt)))
      : [];
    const allowedProjectIds = new Set(rawPlan.linkedProjects.map((p) => p.id));
    return { plan, tickets: rows.filter((t) => !t.developmentProjectId || allowedProjectIds.has(t.developmentProjectId))
      .map((t) => ({
        id: t.id, code: t.code ?? t.id.slice(0, 8), title: t.title,
        description: t.description ?? '', serviceType: t.serviceType,
        status: t.status, priority: t.priority, usedHours: Number(t.usedHours),
        estimatedHours: t.estimatedHours ?? 0, resolvedAt: t.resolvedAt?.toISOString() ?? null,
        resolution: t.resolution, createdAt: t.createdAt.toISOString(),
        developmentProjectId: t.developmentProjectId,
      })) };
  }
}
