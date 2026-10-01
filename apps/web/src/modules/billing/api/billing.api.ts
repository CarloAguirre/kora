import type { BillingLedgerResponse, ListSupportBillingRowsQuery, ListSupportBillingRowsResponse, SupportBillingOverview } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const billingApi = {
  overview(period: string): Promise<SupportBillingOverview> {
    return api.get<SupportBillingOverview>('/support-invoices/overview', { period });
  },
  rows(query: ListSupportBillingRowsQuery): Promise<ListSupportBillingRowsResponse> {
    return api.get<ListSupportBillingRowsResponse>('/support-invoices/overview/rows', query);
  },
  ledger(): Promise<BillingLedgerResponse> {
    return api.get<BillingLedgerResponse>('/support-invoices/billing-ledger');
  },
};

export const billingKeys = {
  overview: (period: string) => ['billing', 'overview', period] as const,
  rows: (query: ListSupportBillingRowsQuery) => ['billing', 'overview', query.period, 'rows', query] as const,
  ledger: () => ['billing', 'ledger'] as const,
};
