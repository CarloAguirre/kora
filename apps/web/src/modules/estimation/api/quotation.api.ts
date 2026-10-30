import type {
  CreateQuotationVersionInput,
  ProjectQuotation,
  QuotationVersion,
  UpdateQuotationDraftInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

const base = (projectId: string) => '/estimations/projects/' + projectId + '/quotation';

export const quotationApi = {
  get(projectId: string): Promise<ProjectQuotation | null> {
    return api.get<ProjectQuotation | null>(base(projectId));
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
};
