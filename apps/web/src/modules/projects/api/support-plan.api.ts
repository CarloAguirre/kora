import type {
  CloseSupportPlanInput,
  CreateProjectInput,
  CreateSupportPlanInput,
  MarkSupportInvoiceIssuedInput,
  MarkSupportInvoicePaidInput,
  SupportPlanListItem,
  SupportPlanWithInvoices,
  SupportProjectDetailSummary,
  UpdateSupportPlanInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const supportPlanApi = {
  getSummaryForProject(projectId: string): Promise<SupportProjectDetailSummary | null> {
    return api.get<SupportProjectDetailSummary | null>(`/support-plans/project/${projectId}`);
  },
  listForClient(clientId: string): Promise<SupportPlanListItem[]> {
    return api.get<SupportPlanListItem[]>(`/support-plans/client/${clientId}`);
  },
  detail(planId: string): Promise<SupportPlanWithInvoices> {
    return api.get<SupportPlanWithInvoices>(`/support-plans/${planId}`);
  },
  create(input: CreateSupportPlanInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/support-plans', input);
  },
  /** Crea un proyecto de soporte junto con su contrato (enlace directo) — para un cliente sin un proyecto de desarrollo terminado que consolidar. */
  createWithProject(input: CreateProjectInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/support-plans/with-project', input);
  },
  update(planId: string, input: UpdateSupportPlanInput): Promise<void> {
    return api.patch<void>(`/support-plans/${planId}`, input);
  },
  close(planId: string, input: CloseSupportPlanInput): Promise<void> {
    return api.patch<void>(`/support-plans/${planId}/close`, input);
  },
  issueInvoice(planId: string, input: MarkSupportInvoiceIssuedInput): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/support-plans/${planId}/invoices`, input);
  },
  markInvoicePaid(invoiceId: string, input: MarkSupportInvoicePaidInput): Promise<void> {
    return api.patch<void>(`/support-invoices/${invoiceId}/paid`, input);
  },
};

export const supportPlanKeys = {
  summary: (projectId: string) => ['support-plan', 'summary', projectId] as const,
  forClient: (clientId: string) => ['support-plan', 'client', clientId] as const,
  /** Prefijo de todos los detalles — el detalle se cachea bajo el slug de la URL, no bajo el UUID que usan las mutaciones. */
  details: () => ['support-plan', 'detail'] as const,
  detail: (planId: string) => ['support-plan', 'detail', planId] as const,
};
