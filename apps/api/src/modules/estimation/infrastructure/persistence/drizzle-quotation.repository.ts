import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { projectAnalysisToQuotationDraft } from '../../domain/project-analysis-to-quotation';
import { QuotationAnalysisIntegrityError, reconcileQuotationAnalysis } from '../../domain/quotation-analysis-integrity';
import { and, asc, desc, eq, inArray, isNull, projectQuotations, projects, quotationEvents, quotationVersions, sql, teams, projectTeams, projectModules, projectModuleTasks, projectModuleSegments, projectPaymentMilestones, type Database } from '@kora/db';
import {
  quotationDraftDataSchema,
  quotationVersionSchema,
  savedQuotationReconciliationReviewSchema,
  type CreateQuotationVersionInput,
  type ProjectQuotation,
  type QuotationDraftData,
  type QuotationOperationalSnapshot,
  type QuotationReconciliationReview,
  type SavedQuotationReconciliationReview,
  type QuotationVersion,
  type UpdateQuotationDraftInput,
} from '@kora/contracts';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { calculateQuotation } from '../../domain/quotation-math';
import type { QuotationProjectScope, QuotationRepository } from '../../domain/repositories/quotation.repository';

@Injectable()
export class DrizzleQuotationRepository implements QuotationRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getProjectScope(projectId: string): Promise<QuotationProjectScope | null> {
    const [p] = await this.db.select({
      id: projects.id,
      type: projects.type,
      salesStage: projects.salesStage,
      status: projects.status,
      leaderUserId: projects.leaderUserId,
    }).from(projects).where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
    return p ?? null;
  }

  /**
   * Lectura puntual del proyecto operativo para R3. No inserta ni cambia
   * registros y no sigue supuestos sobre traspasos de versiones antiguas.
   */
  async getOperationalSnapshot(projectId: string): Promise<QuotationOperationalSnapshot | null> {
    const [project] = await this.db.select({
      id: projects.id,
      salesStage: projects.salesStage,
      status: projects.status,
      soldHours: projects.soldHours,
      usedHours: projects.usedHours,
      startDate: projects.startDate,
      contractAmount: projects.contractAmount,
      contractCurrency: projects.contractCurrency,
    }).from(projects)
      .where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
    if (!project) return null;

    const [assignedTeams, modules, milestones] = await Promise.all([
      this.db.select({
        teamId: projectTeams.teamId,
        teamName: teams.name,
        assignedHours: projectTeams.assignedHours,
        memberLimit: projectTeams.memberCount,
      }).from(projectTeams)
        .leftJoin(teams, eq(projectTeams.teamId, teams.id))
        .where(eq(projectTeams.projectId, projectId)),
      this.db.select({
        id: projectModules.id,
        name: projectModules.name,
        estimatedHours: projectModules.estimatedHours,
      }).from(projectModules).where(eq(projectModules.projectId, projectId)),
      this.db.select({ status: projectPaymentMilestones.status, amount: projectPaymentMilestones.amount })
        .from(projectPaymentMilestones).where(eq(projectPaymentMilestones.projectId, projectId)),
    ]);
    const ids = modules.map((row) => row.id);
    const [tasks, segments] = ids.length > 0 ? await Promise.all([
      this.db.select({
        id: projectModuleTasks.id,
        moduleId: projectModuleTasks.moduleId,
        name: projectModuleTasks.name,
        status: projectModuleTasks.status,
        estimatedHours: projectModuleTasks.estimatedHours,
      }).from(projectModuleTasks).where(inArray(projectModuleTasks.moduleId, ids)),
      this.db.select({ id: projectModuleSegments.id })
        .from(projectModuleSegments).where(inArray(projectModuleSegments.moduleId, ids)),
    ]) : [[], []];
    return {
      projectId: project.id,
      salesStage: project.salesStage,
      status: project.status,
      soldHours: Number(project.soldHours),
      usedHours: Number(project.usedHours),
      startDate: project.startDate?.toISOString().slice(0, 10) ?? null,
      contractAmount: project.contractAmount === null ? null : Number(project.contractAmount),
      contractCurrency: project.contractCurrency,
      teams: assignedTeams.map((team) => ({
        teamId: team.teamId,
        name: team.teamName ?? 'Equipo histórico',
        assignedHours: team.assignedHours === null ? null : Number(team.assignedHours),
        memberLimit: team.memberLimit,
      })),
      moduleCount: modules.length,
      executionModules: modules.map((module) => ({
        id: module.id,
        name: module.name,
        estimatedHours: module.estimatedHours === null ? null : Number(module.estimatedHours),
        tasks: tasks.filter((task) => task.moduleId === module.id).map((task) => ({
          id: task.id, name: task.name, status: task.status,
          estimatedHours: task.estimatedHours === null ? null : Number(task.estimatedHours),
        })),
      })),
      taskCount: tasks.length,
      segmentCount: segments.length,
      paymentMilestones: milestones.map((milestone) => ({
        status: milestone.status, amount: Number(milestone.amount),
      })),
    };
  }

  async getByProjectId(projectId: string): Promise<ProjectQuotation | null> {
    const [quotation] = await this.db.select({ id: projectQuotations.id, projectId: projectQuotations.projectId })
      .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
    if (!quotation) return null;
    const rows = await this.db.select().from(quotationVersions)
      .where(eq(quotationVersions.quotationId, quotation.id)).orderBy(asc(quotationVersions.versionNumber));
    return { ...quotation, versions: rows.map(toVersion) };
  }

  /** Sólo consulta de actas inmutables relacionadas con ESTA cotización. */
  async listReconciliationReviews(projectId: string, versionId: string): Promise<SavedQuotationReconciliationReview[]> {
    const [quotation] = await this.db.select({ id: projectQuotations.id })
      .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
    if (!quotation) return [];
    const [version] = await this.db.select({ id: quotationVersions.id })
      .from(quotationVersions).where(and(
        eq(quotationVersions.id, versionId), eq(quotationVersions.quotationId, quotation.id),
      )).limit(1);
    if (!version) return [];

    const rows = await this.db.select({
      id: quotationEvents.id, actorUserId: quotationEvents.actorUserId,
      occurredAt: quotationEvents.occurredAt, metadata: quotationEvents.metadata,
    }).from(quotationEvents).where(and(
      eq(quotationEvents.versionId, versionId),
      eq(quotationEvents.action, 'reconciliation_review_saved'),
    )).orderBy(desc(quotationEvents.occurredAt), desc(quotationEvents.id)).limit(25);

    return rows.map((row) => savedQuotationReconciliationReviewSchema.parse({
      id: row.id, actorUserId: row.actorUserId,
      occurredAt: row.occurredAt.toISOString(), review: row.metadata['review'],
    }));
  }

  /** Append-only: sólo evento de auditoría, jamás modifica ejecución o versión. */
  async appendReconciliationReview(
    projectId: string, versionId: string, actorId: string,
    review: QuotationReconciliationReview,
  ): Promise<SavedQuotationReconciliationReview | null> {
    return this.db.transaction(async (tx) => {
      const [quotation] = await tx.select({ id: projectQuotations.id })
        .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
      if (!quotation) return null;
      await tx.execute(sql`SELECT id FROM quotation_versions WHERE id = ${versionId} AND quotation_id = ${quotation.id} FOR UPDATE`);
      const [version] = await tx.select({
        id: quotationVersions.id, revision: quotationVersions.revision, status: quotationVersions.status,
      }).from(quotationVersions).where(and(
        eq(quotationVersions.id, versionId), eq(quotationVersions.quotationId, quotation.id),
      )).limit(1);
      if (!version || version.status !== 'draft' || version.revision !== review.versionRevision) return null;
      const [created] = await tx.insert(quotationEvents).values({
        versionId, actorUserId: actorId,
        action: 'reconciliation_review_saved',
        metadata: {
          schemaVersion: review.schemaVersion, status: 'draft_for_discussion',
          versionRevision: review.versionRevision, review,
        },
      }).returning({
        id: quotationEvents.id, actorUserId: quotationEvents.actorUserId,
        occurredAt: quotationEvents.occurredAt,
      });
      if (!created) throw new Error('No se pudo registrar el acta de revisión.');
      return savedQuotationReconciliationReviewSchema.parse({
        id: created.id, actorUserId: created.actorUserId,
        occurredAt: created.occurredAt.toISOString(), review,
      });
    });
  }

  async createDraft(projectId: string, userId: string, input: CreateQuotationVersionInput): Promise<QuotationVersion> {
    return this.db.transaction(async (tx) => {
      await tx.insert(projectQuotations).values({ projectId, createdByUserId: userId }).onConflictDoNothing();
      const [quotation] = await tx.select({ id: projectQuotations.id })
        .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
      if (!quotation) throw new NotFoundException('No se pudo crear la cotización del proyecto.');
      // Serializa los números v1, v2, ... por proyecto y evita carreras entre peticiones.
      await tx.execute(sql`SELECT id FROM project_quotations WHERE id = ${quotation.id} FOR UPDATE`);
      const [last] = await tx.select({ versionNumber: quotationVersions.versionNumber })
        .from(quotationVersions).where(eq(quotationVersions.quotationId, quotation.id))
        .orderBy(desc(quotationVersions.versionNumber)).limit(1);

      let draft: QuotationDraftData = quotationDraftDataSchema.parse({});
      let hourlyRate: number | null = null;
      let currency: 'UF' | 'CLP' | 'USD' = 'UF';
      let tax: 'iva19' | 'igv18' | 'exempt' = 'iva19';
      let origin: 'manual' | 'copy' | 'ai' = 'manual';
      let aiReviewStatus: 'pending' | null = null;
      if (input.simulation) {
        if (input.simulation.analysis.provenance.mode !== 'simulated_fixture') {
          throw new BadRequestException('Esta ruta solo admite artefactos de simulación explícitos.');
        }
        try {
          draft = projectAnalysisToQuotationDraft(
            input.simulation.analysis, input.simulation.roleTeamIds,
          );
        } catch (error) {
          throw new BadRequestException(error instanceof Error ? error.message : 'EDT simulado inválido.');
        }
        const teamIds = draft.teams.map((team) => team.teamId);
        const existing = await tx.select({ id: teams.id }).from(teams)
          .where(and(inArray(teams.id, teamIds), eq(teams.isActive, true), isNull(teams.deletedAt)));
        if (existing.length !== teamIds.length) {
          throw new BadRequestException('El mapeo debe utilizar equipos existentes, activos y no eliminados de Kora.');
        }
        origin = 'ai';
        aiReviewStatus = 'pending';
      }
      if (input.sourceVersionId) {
        const [source] = await tx.select().from(quotationVersions)
          .where(and(eq(quotationVersions.id, input.sourceVersionId), eq(quotationVersions.quotationId, quotation.id))).limit(1);
        if (!source) throw new NotFoundException('La versión para copiar no pertenece a esta cotización.');
        // Una copia MANUAL desde una propuesta IA no hereda fuentes ni respuestas IA.
        const previous = quotationDraftDataSchema.parse(source.draft);
        draft = { ...previous, sourceRefs: [], answers: {}, analysis: null, analysisProjectionStatus: undefined };
        hourlyRate = source.hourlyRate === null ? null : Number(source.hourlyRate);
        currency = source.currency as typeof currency;
        tax = source.tax as typeof tax;
        origin = 'copy';
      }
      const totals = calculateQuotation(draft, hourlyRate, tax);
      const next = (last?.versionNumber ?? 0) + 1;
      const [created] = await tx.insert(quotationVersions).values({
        quotationId: quotation.id,
        versionNumber: next,
        name: input.simulation ? `Simulación IA · ${input.simulation.analysis.project.client.slice(0, 170)}` : `Versión ${next}`,
        status: 'draft',
        origin,
        aiReviewStatus,
        createdByUserId: userId,
        hourlyRate: hourlyRate?.toFixed(4) ?? null,
        currency,
        tax,
        draft,
        totalHours: totals.totalHours.toFixed(2),
        netAmount: totals.netAmount?.toFixed(4) ?? null,
        totalAmount: totals.totalAmount?.toFixed(4) ?? null,
      }).returning();
      if (!created) throw new Error('No se pudo crear la versión.');
      await tx.insert(quotationEvents).values({
        versionId: created.id, actorUserId: userId, action: 'draft_created',
        metadata: { origin, sourceVersionId: input.sourceVersionId ?? null,
          simulation: input.simulation ? 'simulated_fixture' : null },
      });
      return toVersion(created);
    });
  }

  async updateDraft(projectId: string, versionId: string, userId: string, input: UpdateQuotationDraftInput): Promise<QuotationVersion | null> {
    const [quotation] = await this.db.select({ id: projectQuotations.id }).from(projectQuotations)
      .where(eq(projectQuotations.projectId, projectId)).limit(1);
    if (!quotation) return null;
    return this.db.transaction(async (tx) => {
      const [currentRow] = await tx.select({
        draft: quotationVersions.draft,
        status: quotationVersions.status,
        revision: quotationVersions.revision,
      }).from(quotationVersions).where(and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.quotationId, quotation.id),
      )).limit(1);
      if (!currentRow || currentRow.status !== 'draft' || currentRow.revision !== input.revision) {
        return null;
      }
      const savedDraft = quotationDraftDataSchema.parse(currentRow.draft);
      let draft: QuotationDraftData;
      try {
        draft = reconcileQuotationAnalysis(savedDraft, input.draft);
      } catch (error) {
        if (error instanceof QuotationAnalysisIntegrityError) {
          throw new BadRequestException(error.message);
        }
        throw error;
      }
      const totals = calculateQuotation(draft, input.hourlyRate, input.tax);
      const teamIds = draft.teams.map((team) => team.teamId);
      if (teamIds.length > 0) {
        const available = await tx.select({ id: teams.id }).from(teams)
          .where(and(inArray(teams.id, teamIds), eq(teams.isActive, true), isNull(teams.deletedAt)));
        if (available.length !== teamIds.length) {
          throw new BadRequestException('Todos los equipos cotizados deben existir y estar activos en Kora.');
        }
      }
      const [updated] = await tx.update(quotationVersions).set({
        name: input.name,
        hourlyRate: input.hourlyRate?.toFixed(4) ?? null,
        currency: input.currency,
        tax: input.tax,
        draft,
        totalHours: totals.totalHours.toFixed(2),
        netAmount: totals.netAmount?.toFixed(4) ?? null,
        totalAmount: totals.totalAmount?.toFixed(4) ?? null,
        editedByUserId: userId,
        revision: sql`${quotationVersions.revision} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.quotationId, quotation.id),
        eq(quotationVersions.status, 'draft'),
        eq(quotationVersions.revision, input.revision),
      )).returning();
      if (!updated) return null;
      await tx.insert(quotationEvents).values({
        versionId: updated.id, actorUserId: userId, action: 'draft_updated',
        metadata: { previousRevision: input.revision, newRevision: input.revision + 1 },
      });
      return toVersion(updated);
    });
  }
}

function toVersion(row: typeof quotationVersions.$inferSelect): QuotationVersion {
  return quotationVersionSchema.parse({
    id: row.id,
    quotationId: row.quotationId,
    versionNumber: row.versionNumber,
    name: row.name,
    status: row.status,
    origin: row.origin,
    aiReviewStatus: row.aiReviewStatus,
    revision: row.revision,
    createdByUserId: row.createdByUserId,
    hourlyRate: row.hourlyRate === null ? null : Number(row.hourlyRate),
    currency: row.currency,
    tax: row.tax,
    draft: quotationDraftDataSchema.parse(row.draft),
    totalHours: Number(row.totalHours),
    netAmount: row.netAmount === null ? null : Number(row.netAmount),
    totalAmount: row.totalAmount === null ? null : Number(row.totalAmount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
