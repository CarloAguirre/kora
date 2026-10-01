import { useQuery } from '@tanstack/react-query';
import type { ListSupportBillingRowsQuery } from '@kora/contracts';
import { billingApi, billingKeys } from './billing.api';

export function useSupportBillingOverview(period: string) {
  return useQuery({
    queryKey: billingKeys.overview(period),
    queryFn: () => billingApi.overview(period),
    placeholderData: (previous) => previous,
  });
}

/** Tabla del panel — página, filtros y orden los resuelve el servidor. */
export function useSupportBillingRows(query: ListSupportBillingRowsQuery) {
  return useQuery({
    queryKey: billingKeys.rows(query),
    queryFn: () => billingApi.rows(query),
    placeholderData: (previous) => previous,
  });
}

export function useBillingLedger() {
  return useQuery({
    queryKey: billingKeys.ledger(),
    queryFn: () => billingApi.ledger(),
  });
}
