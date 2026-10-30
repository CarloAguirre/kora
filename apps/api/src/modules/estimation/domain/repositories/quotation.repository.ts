import type { CreateQuotationVersionInput, ProjectQuotation, QuotationVersion, UpdateQuotationDraftInput, QuotationOperationalSnapshot } from '@kora/contracts';

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
  createDraft(projectId: string, userId: string, input: CreateQuotationVersionInput): Promise<QuotationVersion>;
  updateDraft(projectId: string, versionId: string, userId: string, input: UpdateQuotationDraftInput): Promise<QuotationVersion | null>;
}
