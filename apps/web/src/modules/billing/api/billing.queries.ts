import { useQuery } from '@tanstack/react-query';
import { billingApi, billingKeys } from './billing.api';

export function useSupportBillingOverview(period: string) {
  return useQuery({
    queryKey: billingKeys.overview(period),
    queryFn: () => billingApi.overview(period),
    placeholderData: (previous) => previous,
  });
}

export function useBillingLedger() {
  return useQuery({
    queryKey: billingKeys.ledger(),
    queryFn: () => billingApi.ledger(),
  });
}
