import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { projectAnalysisToQuotationDraft } from '../../domain/project-analysis-to-quotation';
import { QuotationAnalysisIntegrityError, reconcileQuotationAnalysis } from '../../domain/quotation-analysis-integrity';
import { and, asc, desc, eq, inArray, isNull, hourEntries, projectQuotations, projects, quotationEvents, quotationVersions, sql, teams, projectTeams, projectModules, projectModuleTasks, projectModuleSegments, projectPaymentMilestones, type Database } from '@kora/db';
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
  type QuotationRevisionActionInput,
  type ApproveClientQuotationInput,
  type TransferApprovedQuotationInput,
  type QuotationTransferResult,
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
import { hasOnlyUntouchedDefaultPaymentMilestones } from '../../domain/default-payment-plan-eligibility';
import { initialQuotationTransferBlockers } from '../../domain/initial-quotation-transfer-blockers';
import { hasOnlyCommercialPreparationHours } from '../../domain/commercial-preparation-transfer';
import { buildQuotationTransferReferences } from '../../domain/quotation-transfer-references';
import { InvalidCommercialQuotation, assertQuotationReadyForClient, assertAiProposalReadyToAccept, assertDirectClientApprovalAcknowledged } from '../../domain/quotation-commercial-eligibility';
import type { QuotationProjectScope, QuotationRepository } from '../../domain/repositories/quotation.repository';

/** Mantener Nest fuera del dominio y traducir a HTTP 400 en infraestructura. */
function validateCommercial(action: () => void): void {
  try {
    action();
  } catch (error) {
    if (error instanceof InvalidCommercialQuotation) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

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

  /** Para el agente IA: catálogo activo, nunca perfiles o IDs inventados. */
  async listActiveQuotationTeams(): Promise<QuotationTeamCatalogEntry[]> {
    const rows = await this.db.select({
      teamId: teams.id, name: teams.name,
    }).from(teams).where(and(eq(teams.isActive, true), isNull(teams.deletedAt)))
      .orderBy(asc(teams.name));
    return rows.map((row) => ({ ...row, isActive: true }));
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
    const ids = rows.map((row) => row.id);
    const [transfer] = ids.length ? await this.db.select({
      versionId: quotationEvents.versionId,
      occurredAt: quotationEvents.occurredAt,
    }).from(quotationEvents).where(and(
      inArray(quotationEvents.versionId, ids),
      eq(quotationEvents.action, 'quotation_transferred'),
    )).orderBy(desc(quotationEvents.occurredAt)).limit(1) : [];
    return { ...quotation, versions: rows.map(toVersion),
      transferredVersionId: transfer?.versionId ?? null,
      transferredAt: transfer?.occurredAt.toISOString() ?? null };
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
    dynamicQuestions: readonly EstimationQuestion[], edt: QuotationReferenceEdt,
    confirmedUnderstanding?: string, roleTeamIds?: Readonly<Record<string, string>>): Promise<QuotationVersion> {
    if (proposal.projectId !== projectId || proposal.provider !== 'gemini' ||
        !['poc_simulated', 'drive'].includes(proposal.sourceMode) || proposal.documentsAnalyzed < 1 ||
        proposal.totalHours <= 0 || proposal.roles.some((role) => role.totalHours <= 0) ||
        Math.abs(proposal.roles.reduce((total, role) => total + role.totalHours, 0) - proposal.totalHours) > 0.011 ||
        Math.abs(edt.totalHours - proposal.totalHours) > 0.011 ||
        edt.source !== (proposal.sourceMode === 'drive' ? 'drive' : 'kdm_demo') || edt.provider !== 'gemini') {
      throw new BadRequestException('Propuesta Gemini KDM inválida o sin trazabilidad documental.');
    }
    return this.createVersionInternal(projectId, userId, {}, { proposal, answers, dynamicQuestions, edt, confirmedUnderstanding, roleTeamIds });
  }

  private async createVersionInternal(
    projectId: string, userId: string, input: CreateQuotationVersionInput,
    aiPoc?: { proposal: EstimationPocProposal; answers: readonly SubmitEstimationAnswerInput[];
      dynamicQuestions: readonly EstimationQuestion[]; edt: QuotationReferenceEdt;
      confirmedUnderstanding?: string; roleTeamIds?: Readonly<Record<string, string>> },
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
          sourceRefs: aiPoc.proposal.sourceMode === 'drive'
            ? [...new Set(aiPoc.dynamicQuestions.flatMap((question) => question.sourceRefs.map((ref) => ref.sourceId)))]
            : ['demo:kdm_fixture'],
          answers: Object.fromEntries(aiPoc.answers.map((answer) => [
            answer.questionId, answer.value,
          ])),
          aiPoc: quotationAiPocSnapshotSchema.parse({
            source: aiPoc.proposal.sourceMode === 'drive' ? 'drive' : 'kdm_demo', proposal: aiPoc.proposal,
            answers: aiPoc.answers, dynamicQuestions: aiPoc.dynamicQuestions,
            confirmedUnderstanding: aiPoc.confirmedUnderstanding,
            edt: aiPoc.edt, roleTeamIds: aiPoc.roleTeamIds ?? {},
          }),
        });
        if (aiPoc.roleTeamIds) {
          const assignedTeamIds = [...new Set(Object.values(aiPoc.roleTeamIds))];
          const expectedRoles = aiPoc.proposal.roles.map((role) => role.role);
          if (Object.keys(aiPoc.roleTeamIds).length !== expectedRoles.length ||
              expectedRoles.some((role) => !aiPoc.roleTeamIds?.[role])) {
            throw new BadRequestException('La propuesta Gemini contiene perfiles sin equipo Kora.');
          }
          const existing = await tx.select({ id: teams.id }).from(teams)
            .where(and(inArray(teams.id, assignedTeamIds), eq(teams.isActive, true), isNull(teams.deletedAt)));
          if (existing.length !== assignedTeamIds.length) {
            throw new BadRequestException('La propuesta Gemini utiliza equipos inexistentes o inactivos.');
          }
          draft = projectPocRolesToQuotationDraft(draft, aiPoc.roleTeamIds);
        }
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
        draft = {
          ...previous, sourceRefs: [], answers: {}, analysis: null, aiPoc: null,
          analysisProjectionStatus: undefined,
          edtHourAdjustments: undefined, edtTaskSettings: undefined,
          edtRoleCollaborators: undefined, edtStageSettings: undefined,
          edtCommercialStages: undefined, edtCommercialTasks: undefined,
          edtTaskNames: undefined,
        };
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
        name: aiPoc ? `IA ${aiPoc.proposal.sourceMode === 'drive' ? 'Drive' : 'KDM (demo)'} · versión ${next}` : input.simulation ? `Simulación IA · ${input.simulation.analysis.project.client.slice(0, 170)}` : `Versión ${next}`,
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
          simulation: input.simulation ? 'simulated_fixture' : aiPoc ? (aiPoc.proposal.sourceMode === 'drive' ? null : 'kdm_demo') : null,
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
      origin: quotationVersions.origin, totalHours: quotationVersions.totalHours,
    }).from(quotationVersions).where(eq(quotationVersions.quotationId, quotation.id));
    if (!versions.length) return null;
    const [event] = await this.db.select().from(quotationEvents)
      .where(and(inArray(quotationEvents.versionId, versions.map((v) => v.id)),
        inArray(quotationEvents.action, ['planning_baseline_applied', 'quotation_transferred'])))
      .orderBy(desc(quotationEvents.occurredAt)).limit(1);
    if (!event) return null;
    const version = versions.find((v) => v.id === event.versionId);
    if (!version) return null;
    const metadata = event.metadata as { moduleIds?: string[]; revision?: number; versionRevision?: number };
    const draft = quotationDraftDataSchema.parse(version.draft);
    const edt = draft.aiPoc?.edt;
    if (!metadata.moduleIds) return null;
    const commercialModules = draft.mode === 'phases' && draft.phases.length
      ? draft.phases.map((phase) => ({
          name: phase.name,
          hours: phase.teamHours.reduce((total, row) => total + row.hours, 0),
        }))
      : (edt?.modules ?? []).map((module) => ({
          name: module.name, hours: module.totalHours,
        }));
    const positive = commercialModules.filter((module) => module.hours > 0);
    if (metadata.moduleIds.length !== positive.length) return null;
    const references = buildQuotationTransferReferences(draft,
      positive.map((module, index) => ({
        moduleId: metadata.moduleIds![index]!,
        name: module.name, totalHours: module.hours,
      })));
    return appliedQuotationPlanningSchema.parse({
      projectId, versionId: version.id, versionNumber: version.versionNumber,
      revision: metadata.revision ?? metadata.versionRevision ?? version.revision,
      appliedAt: event.occurredAt.toISOString(),
      appliedByUserId: event.actorUserId,
      source: draft.aiPoc?.source ?? (version.origin === 'copy' ? 'copy' : 'manual'),
      status: event.action === 'quotation_transferred'
        ? 'transferred' : 'accepted_for_planning_only',
      commercialApproval: event.action === 'quotation_transferred',
      totalHours: Number(version.totalHours),
      modules: references.modules,
      unassignedTasks: references.unassignedTasks,
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
      const [existingTeams, existingModules, existingPayments, existingHours] = await Promise.all([
        tx.select({ id: projectTeams.id }).from(projectTeams)
          .where(eq(projectTeams.projectId, projectId)).limit(1),
        tx.select({ id: projectModules.id }).from(projectModules)
          .where(eq(projectModules.projectId, projectId)).limit(1),
        tx.select({
          name: projectPaymentMilestones.name,
          percent: projectPaymentMilestones.percent,
          amount: projectPaymentMilestones.amount,
          sortOrder: projectPaymentMilestones.sortOrder,
          triggerType: projectPaymentMilestones.triggerType,
          triggerPhase: projectPaymentMilestones.triggerPhase,
          triggerDate: projectPaymentMilestones.triggerDate,
          status: projectPaymentMilestones.status,
          invoiceNumber: projectPaymentMilestones.invoiceNumber,
          issuedAt: projectPaymentMilestones.issuedAt,
          dueAt: projectPaymentMilestones.dueAt,
          paidAt: projectPaymentMilestones.paidAt,
        }).from(projectPaymentMilestones)
          .where(eq(projectPaymentMilestones.projectId, projectId)),
        tx.select({ id: hourEntries.id }).from(hourEntries)
          .where(eq(hourEntries.projectId, projectId)).limit(1),
      ]);
      if (Number(project.soldHours) !== 0 || Number(project.usedHours) !== 0 ||
          project.contractAmount !== null || project.startDate !== null ||
          existingTeams.length || existingModules.length || existingHours.length ||
          !hasOnlyUntouchedDefaultPaymentMilestones(existingPayments)) {
        throw new ConflictException(
          'El proyecto ya tiene planificación, HH, contrato o pagos comprometidos. ' +
          'Solo se toleran los dos hitos predeterminados pendientes, sin monto ni facturas.',
        );
      }
      const draft = quotationDraftDataSchema.parse(version.draft);
      const snapshot = draft.aiPoc;
      const edt = snapshot?.edt;
      if (!snapshot || !edt || !['kdm_demo', 'drive'].includes(snapshot.source) ||
          edt.source !== snapshot.source || edt.provider !== 'gemini' ||
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
      const hoursByTeam = new Map<string, number>(
        ids.map((id): [string, number] => [id, 0]),
      );
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
          source: snapshot.source, moduleIds, revision: input.revision,
          totalHours: edt.totalHours,
        },
      }).returning();
      if (!event) throw new Error('No se pudo registrar la aceptación.');
      return appliedQuotationPlanningSchema.parse({
        projectId, versionId, versionNumber: version.versionNumber,
        revision: input.revision, appliedAt: event.occurredAt.toISOString(),
        appliedByUserId: actorId, source: snapshot.source,
        status: 'accepted_for_planning_only', commercialApproval: false,
        totalHours: edt.totalHours,
        modules: edt.modules.map((module, index) => ({
          moduleId: moduleIds[index], name: module.name,
          totalHours: module.totalHours, tasks: module.tasks,
        })),
      });
    });
  }

  /** Elimina una versión solicitada explícitamente; protege el baseline traspasado.
   * No renumera otras versiones, ni toca equipos, HH o pagos operativos. */
  async deleteVersion(projectId: string, versionId: string, revision: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
      const [project] = await tx.select({
        id: projects.id, status: projects.status, salesStage: projects.salesStage,
      }).from(projects).where(and(
        eq(projects.id, projectId), isNull(projects.deletedAt),
      )).limit(1);
      if (!project) throw new NotFoundException('Proyecto no encontrado.');
      const [quotation] = await tx.select({ id: projectQuotations.id })
        .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
      if (!quotation) throw new NotFoundException('Cotización no encontrada.');
      await tx.execute(sql`SELECT id FROM project_quotations WHERE id = ${quotation.id} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM quotation_versions WHERE id = ${versionId} FOR UPDATE`);
      const [version] = await tx.select({ revision: quotationVersions.revision,
        id: quotationVersions.id, status: quotationVersions.status,
      }).from(quotationVersions).where(and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.quotationId, quotation.id),
      )).limit(1);
      if (!version) throw new NotFoundException('La versión no existe en el proyecto.');
      if (version.revision !== revision)
        throw new ConflictException('La cotización cambió. Actualiza la lista antes de eliminar.');
      const [protectedEvent] = await tx.select({ id: quotationEvents.id })
        .from(quotationEvents).where(and(
          eq(quotationEvents.versionId, versionId),
          inArray(quotationEvents.action,
            ['quotation_transferred', 'planning_baseline_applied']),
        )).limit(1);
      if (protectedEvent) {
        throw new ConflictException(
          'No se puede eliminar una cotización ya traspasada a la planificación del proyecto.',
        );
      }
      // Los eventos propios de esta versión se eliminan por su FK ON DELETE CASCADE.
      // El historial de otras versiones sigue intacto.
      await tx.delete(quotationVersions).where(eq(quotationVersions.id, versionId));
      if (version.status === 'approved' &&
          project.status === 'draft' && project.salesStage === 'approved') {
        const remaining = await tx.select({ status: quotationVersions.status })
          .from(quotationVersions)
          .where(eq(quotationVersions.quotationId, quotation.id));
        if (!remaining.some((row) => row.status === 'approved')) {
          await tx.update(projects).set({
            salesStage: remaining.length ? 'quoted' : 'prospect', updatedAt: new Date(),
          }).where(eq(projects.id, projectId));
        }
      }
      return true;
    });
  }

  /** Aceptación IA: nunca modifica project_teams, proyectos ni Roadmap. */
  async acceptAiProposal(projectId: string, versionId: string, userId: string,
    input: QuotationRevisionActionInput): Promise<QuotationVersion> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM quotation_versions WHERE id = ${versionId} FOR UPDATE`);
      const [qv] = await tx.select().from(quotationVersions)
        .innerJoin(projectQuotations, eq(quotationVersions.quotationId, projectQuotations.id))
        .where(and(eq(quotationVersions.id, versionId),
          eq(projectQuotations.projectId, projectId))).limit(1);
      const current = qv?.quotation_versions;
      if (!current) throw new NotFoundException('Versión no encontrada.');
      if (current.status !== 'draft' || current.revision !== input.revision) {
        throw new ConflictException('Revisión obsoleta o versión bloqueada.');
      }
      const version = toVersion(current);
      validateCommercial(() => assertAiProposalReadyToAccept(version));
      const [updated] = await tx.update(quotationVersions).set({
        aiReviewStatus: 'accepted', revision: sql`${quotationVersions.revision} + 1`,
        editedByUserId: userId, updatedAt: new Date(),
      }).where(eq(quotationVersions.id, versionId)).returning();
      await tx.insert(quotationEvents).values({
        versionId, actorUserId: userId, action: 'ai_proposal_accepted',
        metadata: { previousRevision: input.revision,
          newRevision: input.revision + 1,
          manualAdjustments: version.draft.analysisProjectionStatus === 'modified',
          approvedHours: version.totalHours },
      });
      return toVersion(updated!);
    });
  }

  async markSent(projectId: string, versionId: string, userId: string,
    input: QuotationRevisionActionInput): Promise<QuotationVersion> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM quotation_versions WHERE id = ${versionId} FOR UPDATE`);
      const [qv] = await tx.select().from(quotationVersions)
        .innerJoin(projectQuotations, eq(quotationVersions.quotationId, projectQuotations.id))
        .where(and(eq(quotationVersions.id, versionId),
          eq(projectQuotations.projectId, projectId))).limit(1);
      const current = qv?.quotation_versions;
      if (!current) throw new NotFoundException('Versión no encontrada.');
      if (current.status !== 'draft' || current.revision !== input.revision) {
        throw new ConflictException('Solo se envían borradores en la revisión vigente.');
      }
      validateCommercial(() => assertQuotationReadyForClient(toVersion(current)));
      if (process.env.NODE_ENV === 'production' &&
          quotationDraftDataSchema.parse(current.draft).aiPoc?.source === 'kdm_demo') {
        throw new ConflictException('La evidencia KDM es de demostración: no puede enviarse desde producción.');
      }
      const [updated] = await tx.update(quotationVersions).set({
        status: 'sent', sentAt: new Date(), updatedAt: new Date(),
        editedByUserId: userId,
        // El envío congela el borrador ya validado; nunca altera la aceptación IA.
        revision: sql`${quotationVersions.revision} + 1`,
      }).where(eq(quotationVersions.id, versionId)).returning();
      await tx.insert(quotationEvents).values({
        versionId, actorUserId: userId, action: 'quotation_marked_sent',
        metadata: { previousRevision: input.revision, newRevision: input.revision + 1,
          note: 'Registro manual; no envía correo electrónico' },
      });
      return toVersion(updated!);
    });
  }

  async approveClient(projectId: string, versionId: string, userId: string,
    input: ApproveClientQuotationInput): Promise<QuotationVersion> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
      const [project] = await tx.select({ id: projects.id, type: projects.type,
        status: projects.status }).from(projects).where(and(
        eq(projects.id, projectId), isNull(projects.deletedAt),
      )).limit(1);
      if (!project || project.type !== 'development') throw new NotFoundException('Proyecto no disponible.');
      if (!['draft', 'active'].includes(project.status)) throw new ConflictException(
        'No se aprueba una cotización de proyecto detenido o finalizado.',
      );
      const [quotation] = await tx.select({ id: projectQuotations.id })
        .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
      if (!quotation) throw new NotFoundException('Cotización no encontrada.');
      await tx.execute(sql`SELECT id FROM project_quotations WHERE id = ${quotation.id} FOR UPDATE`);
      await tx.execute(sql`SELECT id FROM quotation_versions WHERE id = ${versionId} FOR UPDATE`);
      const [current] = await tx.select().from(quotationVersions).where(and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.quotationId, quotation.id),
      )).limit(1);
      if (!current) throw new NotFoundException('Versión no encontrada.');
      if (!['draft', 'sent'].includes(current.status) || current.revision !== input.revision) {
        throw new ConflictException('Solo se puede aprobar un borrador o envío vigente.');
      }
      validateCommercial(() => assertDirectClientApprovalAcknowledged(
        current.status as 'draft' | 'sent', input.confirmWithoutSend,
      ));
      assertQuotationReadyForClient(toVersion(current));
      if (process.env.NODE_ENV === 'production' &&
          quotationDraftDataSchema.parse(current.draft).aiPoc?.source === 'kdm_demo') {
        throw new ConflictException('No se puede registrar aprobación comercial con documentación KDM de demostración.');
      }
      const previous = await tx.select({ id: quotationVersions.id }).from(quotationVersions)
        .where(and(eq(quotationVersions.quotationId, quotation.id),
          eq(quotationVersions.status, 'approved')));
      for (const item of previous) {
        // Una aprobación histórica conserva su estado original. El evento
        // identifica qué versión la reemplaza sin reescribir su evidencia.
        await tx.insert(quotationEvents).values({
          versionId: item.id, actorUserId: userId,
          action: 'quotation_approval_superseded', metadata: { replacedBy: versionId },
        });
      }
      const [updated] = await tx.update(quotationVersions).set({
        status: 'approved', approvedAt: new Date(), updatedAt: new Date(),
        editedByUserId: userId,
        revision: sql`${quotationVersions.revision} + 1`,
      }).where(eq(quotationVersions.id, versionId)).returning();
      await tx.update(projects).set({ salesStage: 'approved',
        updatedAt: new Date() }).where(eq(projects.id, projectId));
      await tx.insert(quotationEvents).values({
        versionId, actorUserId: userId, action: 'quotation_client_approved',
        metadata: { wasSent: current.status === 'sent',
          previousRevision: input.revision, newRevision: input.revision + 1,
          transferStatus: 'pending',
          directApprovalConfirmed: current.status === 'draft' && input.confirmWithoutSend === true },
      });
      return toVersion(updated!);
    });
  }

  /** Traspaso SOLO de una versión aprobada, a proyecto nuevo sin ejecución.
   * La recotización histórica debe reconciliarse con un proceso distinto. */
  async transferApproved(projectId: string, versionId: string, userId: string,
    input: TransferApprovedQuotationInput): Promise<QuotationTransferResult> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM projects WHERE id = ${projectId} FOR UPDATE`);
      const [project] = await tx.select().from(projects).where(and(
        eq(projects.id, projectId), isNull(projects.deletedAt),
      )).limit(1);
      if (!project || project.type !== 'development') throw new NotFoundException('Proyecto no encontrado.');
      if (project.status !== 'draft' || project.salesStage !== 'approved') {
        throw new ConflictException('Este traspaso inicial requiere proyecto aprobado y No iniciado.');
      }
      const [quotation] = await tx.select({ id: projectQuotations.id })
        .from(projectQuotations).where(eq(projectQuotations.projectId, projectId)).limit(1);
      if (!quotation) throw new NotFoundException('Cotización no encontrada.');
      await tx.execute(sql`SELECT id FROM project_quotations WHERE id = ${quotation.id} FOR UPDATE`);
      const [version] = await tx.select().from(quotationVersions).where(and(
        eq(quotationVersions.id, versionId),
        eq(quotationVersions.quotationId, quotation.id),
      )).limit(1);
      if (!version) throw new NotFoundException('Versión no encontrada.');
      if (version.status !== 'approved' || version.revision !== input.revision) {
        throw new ConflictException('Solo se traspasa la versión aprobada vigente.');
      }
      validateCommercial(() => assertQuotationReadyForClient(toVersion(version)));
      if (process.env.NODE_ENV === 'production' &&
          quotationDraftDataSchema.parse(version.draft).aiPoc?.source === 'kdm_demo') {
        throw new ConflictException('No se transfiere a producción una EDT creada sobre el documento KDM de prueba.');
      }
      const [already] = await tx.select({ id: quotationEvents.id }).from(quotationEvents)
        .innerJoin(quotationVersions, eq(quotationEvents.versionId, quotationVersions.id))
        .where(and(eq(quotationVersions.quotationId, quotation.id),
          inArray(quotationEvents.action,
            ['quotation_transferred', 'planning_baseline_applied'])))
        .limit(1);
      if (already) throw new ConflictException(
        'Ya existe un baseline operativo. No sobrescribir registros históricos.',
      );
      await tx.execute(sql`SELECT id FROM project_payment_milestones WHERE project_id = ${projectId} FOR UPDATE`);
      const [existingTeams, existingModules, existingHours, existingPayments] =
        await Promise.all([
          tx.select({
            id: projectTeams.id, teamId: projectTeams.teamId,
            assignedHours: projectTeams.assignedHours, memberCount: projectTeams.memberCount,
          }).from(projectTeams).where(eq(projectTeams.projectId, projectId)),
          tx.select({ id: projectModules.id }).from(projectModules)
            .where(eq(projectModules.projectId, projectId)).limit(1),
          tx.select({
            id: hourEntries.id, assignment: hourEntries.assignment,
            moduleId: hourEntries.moduleId, status: hourEntries.status, hours: hourEntries.hours,
          }).from(hourEntries).where(eq(hourEntries.projectId, projectId)),
          tx.select().from(projectPaymentMilestones)
            .where(eq(projectPaymentMilestones.projectId, projectId)),
        ]);
      const transferBlockers = initialQuotationTransferBlockers({
        soldHours: Number(project.soldHours),
        usedHours: Number(project.usedHours),
        hasStartDate: project.startDate !== null,
        hasContractAmount: project.contractAmount !== null,
        projectTeamCount: existingTeams.length,
        moduleCount: existingModules.length,
        hourEntryCount: existingHours.length,
        hasChangedPaymentPlan: !hasOnlyUntouchedDefaultPaymentMilestones(existingPayments),
      });
      // Caso A: historia comercial de Prospecto, sin fases operativas ni facturas.
      // Se conservan horas, fechas, miembros y líderes; la nueva cotización
      // actualiza el presupuesto comercial y registra el valor anterior en auditoría.
      const commercialPreparationOnly = existingModules.length === 0 &&
        project.contractAmount === null &&
        hasOnlyUntouchedDefaultPaymentMilestones(existingPayments) &&
        hasOnlyCommercialPreparationHours(existingHours, Number(project.usedHours));
      const unresolvedBlockers = commercialPreparationOnly
        ? transferBlockers.filter((reason) => !(
            reason === 'HH vendidas existentes' ||
            reason === 'HH consumidas existentes' ||
            reason === 'fecha de inicio definida' ||
            reason.endsWith(' equipos asignados') ||
            reason.endsWith(' registros de horas')
          ))
        : transferBlockers;
      if (unresolvedBlockers.length > 0) {
        throw new ConflictException(
          'Traspaso inicial bloqueado: ' + unresolvedBlockers.join('; ') +
          '. Este proyecto requiere conciliación antes de incorporar otra cotización. ' +
          'No se modificaron HH, equipos, Roadmap ni pagos existentes.',
        );
      }
      const draft = quotationDraftDataSchema.parse(version.draft);
      if (draft.aiPoc?.edt && draft.analysisProjectionStatus === 'modified') {
        throw new ConflictException(
          'Se modificaron las HH de la EDT IA original. Primero concilia tareas y fases ' +
          'antes de traspasar los cambios; no se alterará la planificación por aproximación.',
        );
      }
      const ids = draft.teams.map((team) => team.teamId);
      if (ids.length === 0 || ids.length !== new Set(ids).size) {
        throw new BadRequestException('Se requieren equipos únicos en la cotización.');
      }
      const active = await tx.select({ id: teams.id }).from(teams).where(and(
        inArray(teams.id, ids), eq(teams.isActive, true), isNull(teams.deletedAt),
      ));
      if (active.length !== ids.length) throw new ConflictException('Hay equipos inactivos.');
      const byTeam = new Map<string, number>(ids.map((id): [string,number] => [id,0]));
      if (draft.mode === 'phases') {
        for (const phase of draft.phases) for (const row of phase.teamHours) {
          byTeam.set(row.teamId, (byTeam.get(row.teamId) ?? 0) + row.hours);
        }
      } else for (const team of draft.teams) {
        const weeks = team.unit === 'day' ? team.duration / 5 : team.duration;
        byTeam.set(team.teamId,
          team.collaborators * weeks * team.hoursPerWeek * team.dedicationPercent / 100);
      }
      const sum = [...byTeam.values()].reduce((a,b) => a+b,0);
      if (Math.abs(sum - Number(version.totalHours)) > 0.011) {
        throw new BadRequestException('Las HH por equipo difieren del total aprobado.');
      }
      for (const team of draft.teams) {
        await tx.insert(projectTeams).values({
          projectId, teamId: team.teamId, memberCount: team.collaborators,
          assignedHours: (byTeam.get(team.teamId) ?? 0).toFixed(2),
        }).onConflictDoUpdate({
          target: [projectTeams.projectId, projectTeams.teamId],
          set: {
            assignedHours: (byTeam.get(team.teamId) ?? 0).toFixed(2),
            memberCount: team.collaborators,
            updatedAt: new Date(),
          },
        });
        // ON CONFLICT no toca leaderUserId ni project_team_members.
      }
      // Las fases comercialmente aceptadas son la fuente de verdad del
      // Roadmap inicial y de los hitos. No usar nombres de módulos Gemini que
      // difieren de los que el usuario editó en el workspace.
      const modules = draft.mode === 'phases' && draft.phases.length
        ? draft.phases.map((phase) => ({
            name: phase.name,
            hours: phase.teamHours.reduce((n, row) => n + row.hours, 0),
          }))
        : (draft.aiPoc?.edt?.modules ?? []).map((module) => ({
            name: module.name, hours: module.totalHours,
          }));
      const moduleHours = modules.reduce((sum, module) => sum + module.hours, 0);
      if (modules.length > 0 && Math.abs(moduleHours - Number(version.totalHours)) > 0.011) {
        throw new ConflictException(
          'El desglose de fases difiere de las HH aprobadas. No se transferirá un Roadmap inconsistente.',
        );
      }
      const moduleIds: string[] = [];
      const moduleIdByPhase = new Map<string, string>();
      const ambiguousPhaseNames = new Set<string>();
      for (const module of modules) {
        if (module.hours <= 0) continue;
        const [saved] = await tx.insert(projectModules).values({
          projectId, name: module.name, initialStage: 'development',
          currentStage: 'development', estimatedHours: module.hours.toFixed(2),
        }).returning({ id: projectModules.id });
        if (!saved) throw new Error('No se pudo guardar un módulo.');
        moduleIds.push(saved.id);
        if (moduleIdByPhase.has(module.name)) ambiguousPhaseNames.add(module.name);
        moduleIdByPhase.set(module.name, saved.id);
      }
      // El plan predeterminado solo se reemplaza si no se facturó ni alteró.
      await tx.delete(projectPaymentMilestones).where(eq(projectPaymentMilestones.projectId, projectId));
      const total = Number(version.totalAmount);
      if (!Number.isFinite(total) || total < 0) throw new BadRequestException('Monto aprobado inválido.');
      const targetTotal = Math.round((total + Number.EPSILON) * 100) / 100;
      let billed = 0;
      for (const [index, item] of draft.paymentPlan.entries()) {
        let amount = index === draft.paymentPlan.length - 1
          ? Math.round((targetTotal - billed + Number.EPSILON) * 100) / 100
          : Math.round((targetTotal * item.percent / 100 + Number.EPSILON) * 100) / 100;
        if (amount < 0) amount = 0;
        const moduleId = item.trigger === 'phase' && item.triggerPhase
          ? moduleIdByPhase.get(item.triggerPhase) : undefined;
        if (item.trigger === 'phase' && (!moduleId ||
            ambiguousPhaseNames.has(item.triggerPhase ?? ''))) {
          throw new BadRequestException(
            'El hito «' + item.name + '» no tiene una fase comercial única con HH positivas. ' +
            'Revisa las fases y su nombre antes del traspaso.',
          );
        }
        if (item.trigger === 'date' && !item.triggerDate) {
          throw new BadRequestException('Hito por fecha sin fecha definida.');
        }
        await tx.insert(projectPaymentMilestones).values({
          projectId, name: item.name, percent: item.percent.toFixed(2),
          amount: amount.toFixed(2), sortOrder: index, status: 'pending',
          triggerType: item.trigger,
          triggerPhase: null,
          triggerModuleId: item.trigger === 'phase' ? moduleId : null,
          triggerDate: item.trigger === 'date'
            ? new Date(item.triggerDate! + 'T00:00:00.000Z') : null,
        });
        billed += amount;
      }
      if (version.currency !== 'UF' && version.currency !== 'CLP' && version.currency !== 'USD') {
        throw new BadRequestException('Moneda de la cotización incompatible con el contrato del proyecto.');
      }
      await tx.update(projects).set({
        soldHours: Number(version.totalHours).toFixed(2),
        contractAmount: targetTotal.toFixed(2),
        contractCurrency: version.currency,
        updatedAt: new Date(),
      }).where(eq(projects.id, projectId));
      const [event] = await tx.insert(quotationEvents).values({
        versionId, actorUserId: userId, action: 'quotation_transferred',
        metadata: { moduleIds, versionRevision: input.revision,
          totalHours: Number(version.totalHours),
          paymentCount: draft.paymentPlan.length,
          preservedStartDate: true,
          commercialPreparationOnly,
          priorCommercialState: {
            soldHours: Number(project.soldHours),
            usedHours: Number(project.usedHours),
            startDate: project.startDate?.toISOString?.().slice(0, 10) ?? null,
            preexistingTeamIds: existingTeams.map((team) => team.teamId),
            commercialHourEntries: existingHours.length,
          },
          source: draft.aiPoc?.source ?? 'manual',
        },
      }).returning();
      return {
        projectId, versionId, transferredAt: event!.occurredAt.toISOString(),
        projectHours: Number(version.totalHours), teamCount: draft.teams.length,
        moduleCount: moduleIds.length,
        paymentMilestoneCount: draft.paymentPlan.length,
      };
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
        aiReviewStatus: quotationVersions.aiReviewStatus,
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
      const scopeChangedAfterAiAcceptance = Boolean(savedDraft.aiPoc &&
        currentRow.aiReviewStatus === 'accepted' &&
        (JSON.stringify(savedDraft.teams) !== JSON.stringify(draft.teams) ||
         JSON.stringify(savedDraft.phases) !== JSON.stringify(draft.phases) ||
         JSON.stringify(savedDraft.edtHourAdjustments ?? []) !==
           JSON.stringify(draft.edtHourAdjustments ?? []) ||
         JSON.stringify(savedDraft.edtTaskSettings ?? []) !==
           JSON.stringify(draft.edtTaskSettings ?? []) ||
         JSON.stringify(savedDraft.edtStageSettings ?? []) !==
           JSON.stringify(draft.edtStageSettings ?? []) ||
         JSON.stringify(savedDraft.edtRoleCollaborators ?? []) !==
           JSON.stringify(draft.edtRoleCollaborators ?? []) ||
         JSON.stringify(savedDraft.edtCommercialStages ?? []) !==
           JSON.stringify(draft.edtCommercialStages ?? []) ||
         JSON.stringify(savedDraft.edtCommercialTasks ?? []) !==
           JSON.stringify(draft.edtCommercialTasks ?? []) ||
         JSON.stringify(savedDraft.edtTaskNames ?? []) !==
           JSON.stringify(draft.edtTaskNames ?? []) ||
         savedDraft.analysisProjectionStatus !== draft.analysisProjectionStatus));
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
        ...(scopeChangedAfterAiAcceptance ? { aiReviewStatus: 'pending' as const } : {}),
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
        metadata: {
          previousRevision: input.revision, newRevision: input.revision + 1,
          aiReviewReset: scopeChangedAfterAiAcceptance,
        },
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
