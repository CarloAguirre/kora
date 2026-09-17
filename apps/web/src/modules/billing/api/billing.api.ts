import type { BillingLedgerResponse, SupportBillingOverview } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const billingApi = {
  overview(period: string): Promise<SupportBillingOverview> {
    return api.get<SupportBillingOverview>('/support-invoices/overview', { period });
  },
  ledger(): Promise<BillingLedgerResponse> {
    return api.get<BillingLedgerResponse>('/support-invoices/billing-ledger');
  },
};

export const billingKeys = {
  overview: (period: string) => ['billing', 'overview', period] as const,
  ledger: () => ['billing', 'ledger'] as const,
};
