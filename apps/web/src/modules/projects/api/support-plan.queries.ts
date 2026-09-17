import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CloseSupportPlanInput,
  CreateProjectInput,
  CreateSupportPlanInput,
  MarkSupportInvoiceIssuedInput,
  MarkSupportInvoicePaidInput,
  UpdateSupportPlanInput,
} from '@kora/contracts';
import { supportPlanApi, supportPlanKeys } from './support-plan.api';

export function useSupportPlanSummary(projectId: string | null) {
  return useQuery({
    queryKey: supportPlanKeys.summary(projectId ?? ''),
    queryFn: () => supportPlanApi.getSummaryForProject(projectId as string),
    enabled: Boolean(projectId),
  });
}

export function useSupportPlansForClient(clientId: string | null) {
  return useQuery({
    queryKey: supportPlanKeys.forClient(clientId ?? ''),
    queryFn: () => supportPlanApi.listForClient(clientId as string),
    enabled: Boolean(clientId),
  });
}

export function useSupportPlanDetail(planId: string | null) {
  return useQuery({
    queryKey: supportPlanKeys.detail(planId ?? ''),
    queryFn: () => supportPlanApi.detail(planId as string),
    enabled: Boolean(planId),
  });
}

function useInvalidateSupportPlans(clientId?: string, planId?: string) {
  const queryClient = useQueryClient();
  return () => {
    if (clientId) void queryClient.invalidateQueries({ queryKey: supportPlanKeys.forClient(clientId) });
    if (planId) void queryClient.invalidateQueries({ queryKey: supportPlanKeys.detail(planId) });
  };
}

export function useCreateSupportPlan() {
  return useMutation({
    mutationFn: (input: CreateSupportPlanInput) => supportPlanApi.create(input),
  });
}

/** Crea el proyecto de soporte y su contrato juntos — usada por `NewProjectPage` cuando `type === 'support'`. */
export function useCreateSupportProject() {
  return useMutation({
    mutationFn: (input: CreateProjectInput) => supportPlanApi.createWithProject(input),
  });
}

export function useUpdateSupportPlan(planId: string, clientId?: string) {
  const invalidate = useInvalidateSupportPlans(clientId, planId);
  return useMutation({
    mutationFn: (input: UpdateSupportPlanInput) => supportPlanApi.update(planId, input),
    onSuccess: () => invalidate(),
  });
}

export function useCloseSupportPlan(planId: string, clientId?: string) {
  const invalidate = useInvalidateSupportPlans(clientId, planId);
  return useMutation({
    mutationFn: (input: CloseSupportPlanInput) => supportPlanApi.close(planId, input),
    onSuccess: () => invalidate(),
  });
}

export function useIssueSupportInvoice(planId: string, clientId?: string) {
  const invalidate = useInvalidateSupportPlans(clientId, planId);
  return useMutation({
    mutationFn: (input: MarkSupportInvoiceIssuedInput) => supportPlanApi.issueInvoice(planId, input),
    onSuccess: () => invalidate(),
  });
}

export function useMarkSupportInvoicePaid(planId: string, clientId?: string) {
  const invalidate = useInvalidateSupportPlans(clientId, planId);
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: MarkSupportInvoicePaidInput }) =>
      supportPlanApi.markInvoicePaid(invoiceId, input),
    onSuccess: () => invalidate(),
  });
}
