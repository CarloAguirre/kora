import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApplyQuotationPlanningInput, GenerateAiDemoQuotationInput, CreateQuotationVersionInput, UpdateQuotationDraftInput, QuotationReconciliationReview, AssessQuotationReconciliationInput } from '@kora/contracts';
import { quotationApi, quotationKeys } from './quotation.api';

export function useQuotationTaskTypes(projectId: string | null) {
  return useQuery({
    queryKey: quotationKeys.taskTypes(projectId ?? ''),
    queryFn: () => quotationApi.taskTypes(projectId as string),
    enabled: Boolean(projectId),
    staleTime: 60_000,
    retry: false,
  });
}

export function useProjectQuotation(projectId: string | null, enabled = true) {
  return useQuery({
    queryKey: quotationKeys.project(projectId ?? ''),
    queryFn: () => quotationApi.get(projectId as string),
    enabled: enabled && Boolean(projectId),
    retry: false,
  });
}

export function useCreateQuotationVersion(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuotationVersionInput) => quotationApi.create(projectId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.project(projectId) }),
  });
}

/** Gemini real + KDM como fuente de demostración, guardado en PostgreSQL. */
export function useGenerateAiDemoQuotationVersion(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GenerateAiDemoQuotationInput) => quotationApi.generateAiDemoDraft(projectId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.project(projectId) }),
  });
}

export function useSaveQuotationDraft(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, input }: { versionId: string; input: UpdateQuotationDraftInput }) =>
      quotationApi.update(projectId, versionId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: quotationKeys.project(projectId) }),
  });
}

export function useQuotationTransferPreview(projectId: string, versionId: string, revision: number, enabled: boolean) {
  return useQuery({
    queryKey: quotationKeys.transferPreview(projectId, versionId, revision),
    queryFn: () => quotationApi.transferPreview(projectId, versionId),
    enabled: enabled && Boolean(projectId) && Boolean(versionId),
    retry: false,
  });
}

export function useQuotationReconciliationReviews(projectId: string, versionId: string, enabled: boolean) {
  return useQuery({
    queryKey: quotationKeys.reconciliationReviews(projectId, versionId),
    queryFn: () => quotationApi.listReconciliationReviews(projectId, versionId),
    enabled: enabled && Boolean(projectId) && Boolean(versionId),
    retry: false,
  });
}

export function useSaveQuotationReconciliationReview(projectId: string, versionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (review: QuotationReconciliationReview) =>
      quotationApi.saveReconciliationReview(projectId, versionId, review),
    onSuccess: () => client.invalidateQueries({
      queryKey: quotationKeys.reconciliationReviews(projectId, versionId),
    }),
  });
}

export function useQuotationReconciliationAssessments(projectId: string, versionId: string, enabled: boolean) {
  return useQuery({
    queryKey: quotationKeys.reconciliationAssessments(projectId, versionId),
    queryFn: () => quotationApi.listReconciliationAssessments(projectId, versionId),
    enabled: enabled && Boolean(projectId) && Boolean(versionId),
    retry: false,
  });
}

export function useAssessQuotationReconciliation(projectId: string, versionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AssessQuotationReconciliationInput) =>
      quotationApi.assessReconciliationReview(projectId, versionId, input),
    onSuccess: () => client.invalidateQueries({
      queryKey: quotationKeys.reconciliationAssessments(projectId, versionId),
    }),
  });
}

/** Preflight de contenido guardado; no envía ni aprueba cotizaciones. */
export function useQuotationCommercialPreflight(projectId: string, versionId: string, revision: number, enabled: boolean) {
  return useQuery({
    queryKey: quotationKeys.commercialPreflight(projectId, versionId, revision),
    queryFn: () => quotationApi.commercialPreflight(projectId, versionId),
    enabled: enabled && Boolean(projectId) && Boolean(versionId),
    retry: false,
  });
}

/** Fases y tareas de referencia aceptadas, visibles desde Roadmap. */
export function useAppliedQuotationPlanning(projectId: string | null) {
  return useQuery({
    queryKey: quotationKeys.appliedPlan(projectId ?? ''),
    queryFn: () => quotationApi.appliedPlan(projectId as string),
    enabled: Boolean(projectId),
    retry: false,
  });
}

/** El backend vuelve a verificar revisión y proyecto bajo locks antes de escribir. */
export function useApplyQuotationPlanning(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ versionId, input }: {
      versionId: string; input: ApplyQuotationPlanningInput;
    }) => quotationApi.applyPlan(projectId, versionId, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: quotationKeys.project(projectId) });
      void client.invalidateQueries({ queryKey: quotationKeys.appliedPlan(projectId) });
      // El módulo de proyectos tiene su propia cache de detalle/roadmap.
      void client.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/** Acciones del ciclo comercial, independientes de aceptar el presupuesto IA. */
export function useQuotationLifecycle(projectId: string) {
  const client = useQueryClient();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: quotationKeys.project(projectId) });
    void client.invalidateQueries({ queryKey: ['projects'] });
  };
  const acceptAi = useMutation({
    mutationFn: ({ versionId, revision }: { versionId: string; revision: number }) =>
      quotationApi.acceptAi(projectId, versionId, { revision }),
    onSuccess: refresh,
  });
  const markSent = useMutation({
    mutationFn: ({ versionId, revision }: { versionId: string; revision: number }) =>
      quotationApi.markSent(projectId, versionId, { revision }),
    onSuccess: refresh,
  });
  const approveClient = useMutation({
    mutationFn: ({ versionId, revision, confirmWithoutSend }: {
      versionId: string; revision: number; confirmWithoutSend?: true;
    }) => quotationApi.approveClient(projectId, versionId, {
      revision, confirmation: 'CLIENTE_APROBO_ESTA_VERSION',
      ...(confirmWithoutSend ? { confirmWithoutSend: true as const } : {}),
    }),
    onSuccess: refresh,
  });
  const transferApproved = useMutation({
    mutationFn: ({ versionId, revision }: { versionId: string; revision: number }) =>
      quotationApi.transferApproved(projectId, versionId, {
        revision, confirmation: 'TRASPASAR_COTIZACION_APROBADA',
      }),
    onSuccess: refresh,
  });
  return { acceptAi, markSent, approveClient, transferApproved };
}
