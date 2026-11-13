import type {
  CreateQuotationVersionInput,
  GenerateAiDemoQuotationInput,
  AppliedQuotationPlanning,
  ApplyQuotationPlanningInput,
  QuotationRevisionActionInput,
  ApproveClientQuotationInput,
  TransferApprovedQuotationInput,
  QuotationTransferResult,
  ProjectQuotation,
  QuotationVersion,
  QuotationTeamCatalogEntry,
  QuotationTransferPreview,
  QuotationCommercialPreflight,
  QuotationCommercialDossier,
  QuotationReconciliationReview,
  SavedQuotationReconciliationReview,
  AssessQuotationReconciliationInput,
  SavedQuotationReviewAssessment,
  UpdateQuotationDraftInput,
} from '@kora/contracts';
import { api, apiEventStream } from '@/shared/lib/api-client';

const base = (projectId: string) => '/estimations/projects/' + projectId + '/quotation';

export const quotationApi = {
  get(projectId: string): Promise<ProjectQuotation | null> {
    return api.get<ProjectQuotation | null>(base(projectId));
  },
  activeTeams(projectId: string): Promise<QuotationTeamCatalogEntry[]> {
    return api.get<QuotationTeamCatalogEntry[]>(base(projectId) + '/active-teams');
  },
  appliedPlan(projectId: string): Promise<AppliedQuotationPlanning | null> {
    return api.get<AppliedQuotationPlanning | null>(base(projectId) + '/applied-plan');
  },
  applyPlan(projectId: string, versionId: string,
    input: ApplyQuotationPlanningInput): Promise<AppliedQuotationPlanning> {
    return api.post<AppliedQuotationPlanning>(
      base(projectId) + '/versions/' + versionId + '/apply-plan', input,
    );
  },
  commercialDossier(projectId: string, versionId: string): Promise<QuotationCommercialDossier> {
    return api.get<QuotationCommercialDossier>(
      base(projectId) + '/versions/' + versionId + '/commercial-dossier',
    );
  },
  commercialPreflight(projectId: string, versionId: string): Promise<QuotationCommercialPreflight> {
    return api.get<QuotationCommercialPreflight>(
      base(projectId) + '/versions/' + versionId + '/commercial-preflight',
    );
  },
  transferPreview(projectId: string, versionId: string): Promise<QuotationTransferPreview> {
    return api.get<QuotationTransferPreview>(base(projectId) + '/versions/' + versionId + '/transfer-preview');
  },
  listReconciliationReviews(projectId: string, versionId: string): Promise<SavedQuotationReconciliationReview[]> {
    return api.get<SavedQuotationReconciliationReview[]>(
      base(projectId) + '/versions/' + versionId + '/reconciliation-reviews',
    );
  },
  saveReconciliationReview(
    projectId: string, versionId: string, review: QuotationReconciliationReview,
  ): Promise<SavedQuotationReconciliationReview> {
    return api.post<SavedQuotationReconciliationReview>(
      base(projectId) + '/versions/' + versionId + '/reconciliation-reviews', review,
    );
  },
  listReconciliationAssessments(projectId: string, versionId: string): Promise<SavedQuotationReviewAssessment[]> {
    return api.get<SavedQuotationReviewAssessment[]>(
      base(projectId) + '/versions/' + versionId + '/reconciliation-assessments',
    );
  },
  assessReconciliationReview(
    projectId: string, versionId: string, input: AssessQuotationReconciliationInput,
  ): Promise<SavedQuotationReviewAssessment> {
    return api.post<SavedQuotationReviewAssessment>(
      base(projectId) + '/versions/' + versionId + '/reconciliation-assessments', input,
    );
  },
  acceptAi(projectId: string, versionId: string,
    input: QuotationRevisionActionInput): Promise<QuotationVersion> {
    return api.post<QuotationVersion>(base(projectId) + '/versions/' + versionId + '/accept-ai', input);
  },
  markSent(projectId: string, versionId: string,
    input: QuotationRevisionActionInput): Promise<QuotationVersion> {
    return api.post<QuotationVersion>(base(projectId) + '/versions/' + versionId + '/mark-sent', input);
  },
  approveClient(projectId: string, versionId: string,
    input: ApproveClientQuotationInput): Promise<QuotationVersion> {
    return api.post<QuotationVersion>(base(projectId) + '/versions/' + versionId + '/approve-client', input);
  },
  transferApproved(projectId: string, versionId: string,
    input: TransferApprovedQuotationInput): Promise<QuotationTransferResult> {
    return api.post<QuotationTransferResult>(
      base(projectId) + '/versions/' + versionId + '/transfer-approved', input);
  },
  /** Actividad del backend, heartbeat SSE y resúmenes oficiales del modelo. */
  generateAiDemoDraftStream(
    projectId: string, input: GenerateAiDemoQuotationInput,
    onThoughtSummary: (text: string) => void,
    onPhase?: (phase: 'proposal' | 'edt' | 'saving') => void,
    onActivity?: (step: string, text: string, at: string) => void,
    onHeartbeat?: (seconds: number, phase: string) => void,
  ): Promise<QuotationVersion> {
    return apiEventStream<QuotationVersion>(
      base(projectId) + '/versions/ai-poc/stream', input,
      (event, payload) => {
        if (!payload || typeof payload !== 'object') return;
        if (event === 'thought') {
          const text = (payload as { text?: unknown }).text;
          if (typeof text === 'string' && text.length) onThoughtSummary(text);
        } else if (event === 'phase') {
          const phase = (payload as { phase?: unknown }).phase;
          if (phase === 'proposal' || phase === 'edt' || phase === 'saving') onPhase?.(phase);
        } else if (event === 'activity') {
          const { step, text, at } = payload as Record<string, unknown>;
          if (typeof step === 'string' && typeof text === 'string' &&
            typeof at === 'string') onActivity?.(step, text, at);
        } else if (event === 'heartbeat') {
          const { elapsedSeconds, phase } = payload as Record<string, unknown>;
          if (typeof elapsedSeconds === 'number' && typeof phase === 'string') {
            onHeartbeat?.(elapsedSeconds, phase);
          }
        }
      },
    );
  },
  generateAiDemoDraft(projectId: string, input: GenerateAiDemoQuotationInput): Promise<QuotationVersion> {
    return api.post<QuotationVersion>(base(projectId) + '/versions/ai-poc', input);
  },
  create(projectId: string, input: CreateQuotationVersionInput = {}): Promise<QuotationVersion> {
    return api.post<QuotationVersion>(base(projectId) + '/versions', input);
  },
  deleteVersion(projectId: string, versionId: string, revision: number):
    Promise<{ deletedVersionId: string }> {
    return api.delete<{ deletedVersionId: string }>(
      base(projectId) + '/versions/' + versionId + '?revision=' + revision,
    );
  },
  update(projectId: string, versionId: string, input: UpdateQuotationDraftInput): Promise<QuotationVersion> {
    return api.patch<QuotationVersion>(base(projectId) + '/versions/' + versionId, input);
  },
};

export const quotationKeys = {
  all: ['quotations'] as const,
  project: (projectId: string) => [...quotationKeys.all, projectId] as const,
  activeTeams: (projectId: string) => [...quotationKeys.project(projectId), 'active-teams'] as const,
  reconciliationReviews: (projectId: string, versionId: string) =>
    [...quotationKeys.project(projectId), 'reconciliation-reviews', versionId] as const,
  reconciliationAssessments: (projectId: string, versionId: string) =>
    [...quotationKeys.project(projectId), 'reconciliation-assessments', versionId] as const,
  commercialPreflight: (projectId: string, versionId: string, revision: number) =>
    [...quotationKeys.project(projectId), 'commercial-preflight', versionId, revision] as const,
  appliedPlan: (projectId: string) => [...quotationKeys.project(projectId), 'applied-plan'] as const,
  transferPreview: (projectId: string, versionId: string, revision: number) =>
    [...quotationKeys.project(projectId), 'transfer-preview', versionId, revision] as const,
};
