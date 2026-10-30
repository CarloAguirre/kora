import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateQuotationVersionInput, UpdateQuotationDraftInput } from '@kora/contracts';
import { quotationApi, quotationKeys } from './quotation.api';

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
