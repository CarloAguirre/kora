import type {
  CreateQuotationVersionInput,
  ProjectQuotation,
  QuotationVersion,
  QuotationTransferPreview,
  QuotationReconciliationReview,
  SavedQuotationReconciliationReview,
  AssessQuotationReconciliationInput,
  SavedQuotationReviewAssessment,
  UpdateQuotationDraftInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

const base = (projectId: string) => '/estimations/projects/' + projectId + '/quotation';

export const quotationApi = {
  get(projectId: string): Promise<ProjectQuotation | null> {
    return api.get<ProjectQuotation | null>(base(projectId));
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
  create(projectId: string, input: CreateQuotationVersionInput = {}): Promise<QuotationVersion> {
    return api.post<QuotationVersion>(base(projectId) + '/versions', input);
  },
  update(projectId: string, versionId: string, input: UpdateQuotationDraftInput): Promise<QuotationVersion> {
    return api.patch<QuotationVersion>(base(projectId) + '/versions/' + versionId, input);
  },
};

export const quotationKeys = {
  all: ['quotations'] as const,
  project: (projectId: string) => [...quotationKeys.all, projectId] as const,
  reconciliationReviews: (projectId: string, versionId: string) =>
    [...quotationKeys.project(projectId), 'reconciliation-reviews', versionId] as const,
  reconciliationAssessments: (projectId: string, versionId: string) =>
    [...quotationKeys.project(projectId), 'reconciliation-assessments', versionId] as const,
  transferPreview: (projectId: string, versionId: string, revision: number) =>
    [...quotationKeys.project(projectId), 'transfer-preview', versionId, revision] as const,
};
