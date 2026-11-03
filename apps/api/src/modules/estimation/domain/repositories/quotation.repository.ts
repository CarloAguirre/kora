import type { CreateQuotationVersionInput, EstimationPocProposal, SubmitEstimationAnswerInput, EstimationQuestion, QuotationReferenceEdt, AppliedQuotationPlanning, ApplyQuotationPlanningInput, QuotationRevisionActionInput, ApproveClientQuotationInput, TransferApprovedQuotationInput, QuotationTransferResult, ProjectQuotation, QuotationVersion, UpdateQuotationDraftInput, QuotationOperationalSnapshot, QuotationReconciliationReview, SavedQuotationReconciliationReview, AssessQuotationReconciliationInput, SavedQuotationReviewAssessment, QuotationTeamCatalogEntry, QuotationTaskCatalogEntry } from '@kora/contracts';

export const QUOTATION_REPOSITORY = Symbol('QUOTATION_REPOSITORY');

export interface QuotationProjectScope {
  id: string;
  type: 'development' | 'support';
  salesStage: 'prospect' | 'quoted' | 'approved' | null;
  status: 'draft' | 'active' | 'on_hold' | 'finished' | 'cancelled';
  leaderUserId: string | null;
}

export interface QuotationRepository {
  getProjectScope(projectId: string): Promise<QuotationProjectScope | null>;
  getByProjectId(projectId: string): Promise<ProjectQuotation | null>;
  getOperationalSnapshot(projectId: string): Promise<QuotationOperationalSnapshot | null>;
  getTeamCatalogForQuotation(teamIds: readonly string[]): Promise<QuotationTeamCatalogEntry[]>;
  /** Catálogo íntegro y ACTIVO para que Gemini no invente equipos. */
  listActiveQuotationTeams(): Promise<QuotationTeamCatalogEntry[]>;
  listActiveQuotationTaskTypes(): Promise<QuotationTaskCatalogEntry[]>;
  listReconciliationReviews(projectId: string, versionId: string): Promise<SavedQuotationReconciliationReview[]>;
  appendReconciliationReview(
    projectId: string, versionId: string, actorId: string,
    review: QuotationReconciliationReview,
  ): Promise<SavedQuotationReconciliationReview | null>;
  listReconciliationAssessments(projectId: string, versionId: string): Promise<SavedQuotationReviewAssessment[]>;
  appendReconciliationAssessment(
    projectId: string, versionId: string, reviewerUserId: string,
    input: AssessQuotationReconciliationInput,
  ): Promise<SavedQuotationReviewAssessment | null>;
  createDraft(projectId: string, userId: string, input: CreateQuotationVersionInput): Promise<QuotationVersion>;
  createAiPocDraft(projectId: string, userId: string,
    proposal: EstimationPocProposal, answers: readonly SubmitEstimationAnswerInput[],
    dynamicQuestions: readonly EstimationQuestion[], edt: QuotationReferenceEdt,
    confirmedUnderstanding?: string, roleTeamIds?: Readonly<Record<string, string>>): Promise<QuotationVersion>;
  updateDraft(projectId: string, versionId: string, userId: string, input: UpdateQuotationDraftInput): Promise<QuotationVersion | null>;
  acceptAiProposal(projectId: string, versionId: string, userId: string,
    input: QuotationRevisionActionInput): Promise<QuotationVersion>;
  markSent(projectId: string, versionId: string, userId: string,
    input: QuotationRevisionActionInput): Promise<QuotationVersion>;
  approveClient(projectId: string, versionId: string, userId: string,
    input: ApproveClientQuotationInput): Promise<QuotationVersion>;
  transferApproved(projectId: string, versionId: string, userId: string,
    input: TransferApprovedQuotationInput): Promise<QuotationTransferResult>;
  getAppliedPlanningBaseline(projectId: string): Promise<AppliedQuotationPlanning | null>;
  applyPlanningBaseline(projectId: string, versionId: string, actorId: string,
    input: ApplyQuotationPlanningInput): Promise<AppliedQuotationPlanning>;
}
