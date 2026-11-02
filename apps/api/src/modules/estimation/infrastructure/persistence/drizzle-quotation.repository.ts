import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { projectAnalysisToQuotationDraft } from '../../domain/project-analysis-to-quotation';
import { QuotationAnalysisIntegrityError, reconcileQuotationAnalysis } from '../../domain/quotation-analysis-integrity';
import { and, asc, desc, eq, inArray, isNull, projectQuotations, projects, quotationEvents, quotationVersions, sql, teams, projectTeams, projectModules, projectModuleTasks, projectModuleSegments, projectPaymentMilestones, type Database } from '@kora/db';
import {
  quotationDraftDataSchema,
  quotationAiPocSnapshotSchema,
  appliedQuotationPlanningSchema,
  projectPocRolesToQuotationDraft,
  validatePocDraftIntegrity,
  quotationVersionSchema,
  savedQuotationReconciliationReviewSchema,
  savedQuotationReviewAssessmentSchema,
  type CreateQuotationVersionInput,
  type EstimationPocProposal,
  type EstimationQuestion,
  type QuotationReferenceEdt,
  type ApplyQuotationPlanningInput,
  type AppliedQuotationPlanning,
  type SubmitEstimationAnswerInput,
  type ProjectQuotation,
  type QuotationDraftData,
  type QuotationOperationalSnapshot,
  type QuotationReconciliationReview,
  type SavedQuotationReconciliationReview,
  type AssessQuotationReconciliationInput,
  type SavedQuotationReviewAssessment,
  type QuotationVersion,
  type QuotationTeamCatalogEntry,
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

  /** Consulta TODOS los IDs cotizados, incluyendo equipos ahora inactivos. */
  async getTeamCatalogForQuotation(teamIds: readonly string[]): Promise<QuotationTeamCatalogEntry[]> {
    if (teamIds.length === 0) return [];
    const rows = await this.db.select({
      teamId: teams.id,
      name: teams.name,
      isActive: teams.isActive,
      deletedAt: teams.deletedAt,
    }).from(teams).where(inArray(teams.id, [...new Set(teamIds)]));
    return rows.map((row) => ({
      teamId: row.teamId,
      name: row.name,
      isActive: row.isActive && row.deletedAt === null,
    }));
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

  /** Historial de decisiones técnicas, independiente del estado contractual. */
  async listReconciliationAssessments(projectId: string, versionId: string): Promise<SavedQuotationReviewAssessment[]> {
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
      eq(quotationEvents.action, 'reconciliation_review_assessed'),
    )).orderBy(desc(quotationEvents.occurredAt), desc(quotationEvents.id)).limit(25);
    return rows.map((row) => savedQuotationReviewAssessmentSchema.parse({
      id: row.id,
      reviewId: row.metadata['reviewId'],
      versionId, versionRevision: row.metadata['versionRevision'],
      reviewerUserId: row.actorUserId, occurredAt: row.occurredAt.toISOString(),
      decision: row.metadata['decision'], reason: row.metadata['reason'],
      status: 'technical_review_only', transferEnabled: false,
    }));
  }

  /** Serializa bajo lock para impedir revisiones dobles o de actas obsoletas. */
  async appendReconciliationAssessment(
    projectId: string, versionId: string, reviewerUserId: string,
    input: AssessQuotationReconciliationInput,
  ): Promise<SavedQuotationReviewAssessment | null> {
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
      if (!version || version.status !== 'draft' || version.revision !== input.versionRevision) return null;

      const [latest] = await tx.select({
        id: quotationEvents.id, actorUserId: quotationEvents.actorUserId,
      }).from(quotationEvents).where(and(
        eq(quotationEvents.versionId, versionId),
        eq(quotationEvents.action, 'reconciliation_review_saved'),
      )).orderBy(desc(quotationEvents.occurredAt), desc(quotationEvents.id)).limit(1);
      if (!latest || latest.id !== input.reviewId || latest.actorUserId === reviewerUserId) return null;
      const [prior] = await tx.select({ id: quotationEvents.id })
        .from(quotationEvents).where(and(
          eq(quotationEvents.versionId, versionId),
          eq(quotationEvents.action, 'reconciliation_review_assessed'),
          sql`${quotationEvents.metadata}->>'reviewId' = ${input.reviewId}`,
        )).limit(1);
      if (prior) return null;

      const [created] = await tx.insert(quotationEvents).values({
        versionId, actorUserId: reviewerUserId, action: 'reconciliation_review_assessed',
        metadata: { reviewId: input.reviewId, versionRevision: input.versionRevision,
          decision: input.decision, reason: input.reason, status: 'technical_review_only',
          transferEnabled: false },
      }).returning({ id: quotationEvents.id, actorUserId: quotationEvents.actorUserId,
        occurredAt: quotationEvents.occurredAt });
      if (!created) throw new Error('No se pudo guardar la evaluación técnica.');
      return savedQuotationReviewAssessmentSchema.parse({
        id: created.id, reviewId: input.reviewId, versionId,
        versionRevision: input.versionRevision, reviewerUserId: created.actorUserId,
        occurredAt: created.occurredAt.toISOString(), decision: input.decision,
        reason: input.reason, status: 'technical_review_only', transferEnabled: false,
      });
    });
  }

  async createDraft(projectId: string, userId: string, input: CreateQuotationVersionInput): Promise<QuotationVersion> {
    return this.createVersionInternal(projectId, userId, input);
  }

  async createAiPocDraft(projectId: string, userId: string, proposal: EstimationPocProposal,
    answers: readonly SubmitEstimationAnswerInput[],
    dynamicQuestions: readonly EstimationQuestion[], edt: QuotationReferenceEdt): Promise<QuotationVersion> {
    if (proposal.projectId !== projectId || proposal.provider !== 'gemini' ||
        proposal.sourceMode !== 'poc_simulated' || proposal.documentsAnalyzed < 1 ||
        proposal.totalHours <= 0 || proposal.roles.some((role) => role.totalHours <= 0) ||
        Math.abs(proposal.roles.reduce((total, role) => total + role.totalHours, 0) - proposal.totalHours) > 0.011 ||
        Math.abs(edt.totalHours - proposal.totalHours) > 0.011 ||
        edt.source !== 'kdm_demo' || edt.provider !== 'gemini') {
      throw new BadRequestException('Propuesta Gemini KDM inválida o sin trazabilidad documental.');
    }
    return this.createVersionInternal(projectId, userId, {}, { proposal, answers, dynamicQuestions, edt });
  }

  private async createVersionInternal(
    projectId: string, userId: string, input: CreateQuotationVersionInput,
    aiPoc?: { proposal: EstimationPocProposal; answers: readonly SubmitEstimationAnswerInput[];
      dynamicQuestions: readonly EstimationQuestion[]; edt: QuotationReferenceEdt },
  ): Promise<QuotationVersion> {
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
      if (aiPoc) {
        draft = quotationDraftDataSchema.parse({
          mode: 'phases',
          teams: [],
          phases: [],
          costs: [],
          paymentPlan: [],
          assumptions: aiPoc.proposal.assumptions,
          exclusions: [],
          sourceRefs: ['demo:kdm_fixture'],
          answers: Object.fromEntries(aiPoc.answers.map((answer) => [
            answer.questionId, answer.value,
          ])),
          aiPoc: quotationAiPocSnapshotSchema.parse({
            source: 'kdm_demo', proposal: aiPoc.proposal,
            answers: aiPoc.answers, dynamicQuestions: aiPoc.dynamicQuestions,
            edt: aiPoc.edt, roleTeamIds: {},
          }),
        });
        origin = 'ai';
        aiReviewStatus = 'pending';
      }
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
        const sourceProjectId = input.sourceProjectId ?? projectId;
        const [sourceQuotation] = await tx.select({ id: projectQuotations.id })
          .from(projectQuotations).where(eq(projectQuotations.projectId, sourceProjectId)).limit(1);
        if (!sourceQuotation) throw new NotFoundException('Cotización de origen no encontrada.');
        const [source] = await tx.select().from(quotationVersions)
          .where(and(eq(quotationVersions.id, input.sourceVersionId),
            eq(quotationVersions.quotationId, sourceQuotation.id))).limit(1);
        if (!source) throw new NotFoundException('La versión no pertenece a la cotización de origen.');
        // Una copia MANUAL desde una propuesta IA no hereda fuentes ni respuestas IA.
        const previous = quotationDraftDataSchema.parse(source.draft);
        draft = { ...previous, sourceRefs: [], answers: {}, analysis: null, aiPoc: null, analysisProjectionStatus: undefined };
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
        name: aiPoc ? `IA KDM (demo) · versión ${next}` : input.simulation ? `Simulación IA · ${input.simulation.analysis.project.client.slice(0, 170)}` : `Versión ${next}`,
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
          sourceProjectId: input.sourceVersionId ? (input.sourceProjectId ?? projectId) : null,
          simulation: input.simulation ? 'simulated_fixture' : aiPoc ? 'kdm_demo' : null,
          provider: aiPoc?.proposal.provider ?? null,
          proposedHours: aiPoc?.proposal.totalHours ?? null },
      });
      return toVersion(created);
    });
  }


  async getAppliedPlanningBaseline(projectId: string): Promise<AppliedQuotationPlanning | null> {
    const [quotation] = await this.db.select({ id: projectQuotations.id })
      .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
    if (!quotation) return null;
    const versions = await this.db.select({
      id: quotationVersions.id, versionNumber: quotationVersions.versionNumber,
      revision: quotationVersions.revision, draft: quotationVersions.draft,
    }).from(quotationVersions).where(eq(quotationVersions.quotationId, quotation.id));
    if (!versions.length) return null;
    const [event] = await this.db.select().from(quotationEvents)
      .where(and(inArray(quotationEvents.versionId, versions.map((v) => v.id)),
        eq(quotationEvents.action, 'planning_baseline_applied')))
      .orderBy(desc(quotationEvents.occurredAt)).limit(1);
    if (!event) return null;
    const version = versions.find((v) => v.id === event.versionId);
    if (!version) return null;
    const metadata = event.metadata as { moduleIds?: string[]; revision?: number };
    const edt = quotationDraftDataSchema.parse(version.draft).aiPoc?.edt;
    if (!edt || !metadata.moduleIds || metadata.moduleIds.length !== edt.modules.length) return null;
    return appliedQuotationPlanningSchema.parse({
      projectId, versionId: version.id, versionNumber: version.versionNumber,
      revision: metadata.revision ?? version.revision,
      appliedAt: event.occurredAt.toISOString(),
      appliedByUserId: event.actorUserId, source: 'kdm_demo',
      status: 'accepted_for_planning_only', commercialApproval: false,
      totalHours: edt.totalHours,
      modules: edt.modules.map((module, i) => ({
        moduleId: metadata.moduleIds![i], name: module.name,
        totalHours: module.totalHours, tasks: module.tasks,
      })),
    });
  }

  /**
   * ÚNICA aplicación del baseline KDM: locks + revalidación + escritura
   * de equipos, HH y fases, sin inventar fechas de tareas ni facturar.
   */
  async applyPlanningBaseline(projectId: string, versionId: string, actorId: string,
    input: ApplyQuotationPlanningInput): Promise<AppliedQuotationPlanning> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
      const [project] = await tx.select({
        id: projects.id, type: projects.type, salesStage: projects.salesStage,
        status: projects.status, soldHours: projects.soldHours,
        usedHours: projects.usedHours, contractAmount: projects.contractAmount,
        startDate: projects.startDate,
      }).from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt))).limit(1);
      if (!project || project.type !== 'development') throw new NotFoundException('Proyecto no encontrado.');
      if (!['prospect', 'quoted'].includes(project.salesStage ?? '') ||
          !['draft', 'active'].includes(project.status)) {
        throw new ConflictException('Solo se aplica planificación inicial de prospectos/cotizaciones.');
      }
      const [quotation] = await tx.select({ id: projectQuotations.id })
        .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
      if (!quotation) throw new NotFoundException('Cotización no encontrada.');
      await tx.execute(sql`SELECT id FROM quotation_versions WHERE id = ${versionId} FOR UPDATE`);
      const [version] = await tx.select().from(quotationVersions).where(and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.quotationId, quotation.id),
      )).limit(1);
      if (!version) throw new NotFoundException('Versión ajena al proyecto.');
      const [latest] = await tx.select({ id: quotationVersions.id })
        .from(quotationVersions).where(eq(quotationVersions.quotationId, quotation.id))
        .orderBy(desc(quotationVersions.versionNumber)).limit(1);
      if (!latest || latest.id !== versionId) {
        throw new ConflictException('Solo la última versión de la cotización puede crear la planificación inicial.');
      }
      const [already] = await tx.select({ id: quotationEvents.id }).from(quotationEvents)
        .innerJoin(quotationVersions, eq(quotationEvents.versionId, quotationVersions.id))
        .where(and(eq(quotationVersions.quotationId, quotation.id),
          eq(quotationEvents.action, 'planning_baseline_applied'))).limit(1);
      if (already) throw new ConflictException('El proyecto ya tiene una planificación aplicada.');
      if (version.status !== 'draft' || version.revision !== input.revision || version.origin !== 'ai') {
        throw new ConflictException('La revisión cambió o la versión no es un borrador IA.');
      }
      const [existingTeams, existingModules, existingPayments] = await Promise.all([
        tx.select({ id: projectTeams.id }).from(projectTeams)
          .where(eq(projectTeams.projectId, projectId)).limit(1),
        tx.select({ id: projectModules.id }).from(projectModules)
          .where(eq(projectModules.projectId, projectId)).limit(1),
        tx.select({ id: projectPaymentMilestones.id }).from(projectPaymentMilestones)
          .where(eq(projectPaymentMilestones.projectId, projectId)).limit(1),
      ]);
      if (Number(project.soldHours) !== 0 || Number(project.usedHours) !== 0 ||
          project.contractAmount !== null || project.startDate !== null ||
          existingTeams.length || existingModules.length || existingPayments.length) {
        throw new ConflictException(
          'El proyecto ya tiene planificación, HH, fechas, contrato o pagos. No se sobreescribe.',
        );
      }
      const draft = quotationDraftDataSchema.parse(version.draft);
      const snapshot = draft.aiPoc;
      const edt = snapshot?.edt;
      if (!snapshot || !edt || snapshot.source !== 'kdm_demo' ||
          edt.source !== 'kdm_demo' || edt.provider !== 'gemini' ||
          snapshot.proposal.provider !== 'gemini' ||
          snapshot.proposal.projectId !== projectId ||
          draft.analysisProjectionStatus !== 'synced') {
        throw new BadRequestException('EDT no conciliada o sin evidencia Gemini/KDM.');
      }
      const roles = snapshot.proposal.roles;
      const roleNames = roles.map((role) => role.role);
      if (!roles.length || new Set(roleNames).size !== roles.length ||
          roleNames.some((role) => !snapshot.roleTeamIds[role]) ||
          Object.keys(snapshot.roleTeamIds).length !== roles.length) {
        throw new BadRequestException('Faltan perfiles por mapear a equipos.');
      }
      const expected = projectPocRolesToQuotationDraft(draft, snapshot.roleTeamIds);
      if (JSON.stringify(expected.teams) !== JSON.stringify(draft.teams) ||
          JSON.stringify(expected.phases) !== JSON.stringify(draft.phases)) {
        throw new BadRequestException('Los equipos y HH difieren de la propuesta IA.');
      }
      if (Math.abs(edt.totalHours - snapshot.proposal.totalHours) > 0.011 ||
          Math.abs(edt.totalHours - Number(version.totalHours)) > 0.011 ||
          edt.modules.length === 0) {
        throw new BadRequestException('La EDT no coincide con las HH cotizadas.');
      }
      const hoursByRole = new Map<string, number>();
      for (const module of edt.modules) {
        if (!module.tasks.length ||
            Math.abs(module.tasks.reduce((n, task) => n + task.hours, 0) - module.totalHours) > 0.011) {
          throw new BadRequestException('Fase con HH incoherentes.');
        }
        for (const task of module.tasks) {
          if (!snapshot.roleTeamIds[task.role]) throw new BadRequestException('Tarea con perfil sin equipo.');
          hoursByRole.set(task.role, (hoursByRole.get(task.role) ?? 0) + task.hours);
        }
      }
      for (const role of roles) {
        if (Math.abs((hoursByRole.get(role.role) ?? 0) - role.totalHours) > 0.011) {
          throw new BadRequestException('Las tareas no conservan las HH de ' + role.role);
        }
      }
      const ids = draft.teams.map((team) => team.teamId);
      if (!ids.length || ids.length !== new Set(ids).size) {
        throw new BadRequestException('Equipos duplicados o faltantes.');
      }
      const active = await tx.select({ id: teams.id }).from(teams)
        .where(and(inArray(teams.id, ids), eq(teams.isActive, true), isNull(teams.deletedAt)));
      if (active.length !== ids.length) throw new ConflictException('Equipo cotizado inactivo o eliminado.');
      const hoursByTeam = new Map(ids.map((id) => [id, 0]));
      for (const [role, hh] of hoursByRole) {
        const teamId = snapshot.roleTeamIds[role]!;
        hoursByTeam.set(teamId, (hoursByTeam.get(teamId) ?? 0) + hh);
      }
      for (const team of draft.teams) {
        const hh = hoursByTeam.get(team.teamId) ?? 0;
        if (hh <= 0) throw new BadRequestException('Equipo sin HH.');
        await tx.insert(projectTeams).values({
          projectId, teamId: team.teamId, memberCount: team.collaborators,
          assignedHours: hh.toFixed(2),
        });
      }
      const moduleIds: string[] = [];
      for (const module of edt.modules) {
        const [saved] = await tx.insert(projectModules).values({
          projectId, name: module.name, initialStage: 'development',
          currentStage: 'development', estimatedHours: module.totalHours.toFixed(2),
        }).returning({ id: projectModules.id });
        if (!saved) throw new Error('No se pudo guardar una fase.');
        moduleIds.push(saved.id);
      }
      await tx.update(projects).set({
        soldHours: edt.totalHours.toFixed(2), updatedAt: new Date(),
      }).where(eq(projects.id, projectId));
      await tx.update(quotationVersions).set({
        aiReviewStatus: 'accepted', updatedAt: new Date(),
      }).where(eq(quotationVersions.id, versionId));
      const [event] = await tx.insert(quotationEvents).values({
        versionId, actorUserId: actorId, action: 'planning_baseline_applied',
        metadata: {
          status: 'accepted_for_planning_only', commercialApproval: false,
          source: 'kdm_demo', moduleIds, revision: input.revision,
          totalHours: edt.totalHours,
        },
      }).returning();
      if (!event) throw new Error('No se pudo registrar la aceptación.');
      return appliedQuotationPlanningSchema.parse({
        projectId, versionId, versionNumber: version.versionNumber,
        revision: input.revision, appliedAt: event.occurredAt.toISOString(),
        appliedByUserId: actorId, source: 'kdm_demo',
        status: 'accepted_for_planning_only', commercialApproval: false,
        totalHours: edt.totalHours,
        modules: edt.modules.map((module, index) => ({
          moduleId: moduleIds[index], name: module.name,
          totalHours: module.totalHours, tasks: module.tasks,
        })),
      });
    });
  }

  async updateDraft(projectId: string, versionId: string, userId: string, input: UpdateQuotationDraftInput): Promise<QuotationVersion | null> {
    const [quotation] = await this.db.select({ id: projectQuotations.id }).from(projectQuotations)
      .where(eq(projectQuotations.projectId, projectId)).limit(1);
    if (!quotation) return null;
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM quotation_versions WHERE id = ${versionId} FOR UPDATE`);
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
      const [baseline] = await tx.select({ id: quotationEvents.id })
        .from(quotationEvents).where(and(
          eq(quotationEvents.versionId, versionId),
          eq(quotationEvents.action, 'planning_baseline_applied'),
        )).limit(1);
      if (baseline) throw new ConflictException(
        'La versión ya generó planificación. Crea una nueva cotización para cambiarla.',
      );
      const savedDraft = quotationDraftDataSchema.parse(currentRow.draft);
      let draft: QuotationDraftData;
      try {
        validatePocDraftIntegrity(savedDraft, input.draft);
        draft = reconcileQuotationAnalysis(savedDraft, input.draft);
      } catch (error) {
        if (error instanceof QuotationAnalysisIntegrityError || error instanceof Error) {
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
