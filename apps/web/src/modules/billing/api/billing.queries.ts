import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListSupportBillingRowsQuery, MarkSupportInvoiceIssuedInput, MarkSupportInvoicePaidInput } from '@kora/contracts';
import { billingApi, billingKeys } from './billing.api';
import { supportPlanApi, supportPlanKeys } from '@/modules/projects/api/support-plan.api';

/** Tras facturar o registrar un pago desde el panel: sus KPIs y filas, y la ficha del contrato si estaba en caché. */
function useInvalidateBilling() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['billing'] });
    void queryClient.invalidateQueries({ queryKey: supportPlanKeys.details() });
  };
}

/** "Registrar factura" del período en curso desde el panel — misma API que la ficha del contrato. */
export function useIssueSupportInvoiceFromBilling() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ planId, input }: { planId: string; input: MarkSupportInvoiceIssuedInput }) => supportPlanApi.issueInvoice(planId, input),
    onSuccess: () => invalidate(),
  });
}

export function useMarkSupportInvoicePaidFromBilling() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: MarkSupportInvoicePaidInput }) =>
      supportPlanApi.markInvoicePaid(invoiceId, input),
    onSuccess: () => invalidate(),
  });
}

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
