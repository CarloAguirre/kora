import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  AnalyzeEstimationPocInput,
  GenerateEstimationPocInput,
  ResolveEstimationDriveFolderInput,
} from '@kora/contracts';
import { estimationApi, estimationKeys } from './estimation.api';

/** Oculta la función experimental si la API no la habilitó explícitamente. */
export function useEstimationDriveOAuthPocStatus(enabled = true) {
  return useQuery({
    queryKey: [...estimationKeys.all, 'drive-oauth-poc-status'] as const,
    queryFn: () => estimationApi.driveOAuthPocStatus(),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useEstimationQuestionnaireDefinition(enabled = true) {
  return useQuery({
    queryKey: estimationKeys.questionnaireDefinition(),
    queryFn: () => estimationApi.questionnaireDefinition(),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useResolveEstimationDriveFolder(
  input: ResolveEstimationDriveFolderInput | null,
  enabled = true,
) {
  return useQuery({
    queryKey: estimationKeys.driveResolution(input?.projectId ?? 'none'),
    queryFn: () => {
      if (!input) throw new Error('No hay proyecto para resolver Drive.');
      return estimationApi.resolveDriveFolder(input);
    },
    enabled: enabled && input !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useEstimationDriveInventory(
  driveFolderUrl: string,
  enabled = true,
) {
  return useQuery({
    queryKey: estimationKeys.driveInventory(driveFolderUrl),
    queryFn: () =>
      estimationApi.inventoryDrive({
        driveFolderUrl,
        maxDepth: 3,
      }),
    enabled: enabled && driveFolderUrl.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

export function useEstimationDriveFiles(driveFolderUrl: string, enabled = true) {
  return useQuery({
    queryKey: estimationKeys.driveFiles(driveFolderUrl),
    queryFn: () => estimationApi.driveFiles({ driveFolderUrl }),
    enabled: enabled && driveFolderUrl.length > 0,
    staleTime: 60_000,
    retry: false,
  });
}

export interface AnalyzeEstimationWithSummaries extends AnalyzeEstimationPocInput {
  readonly onThoughtSummary?: (text: string) => void;
  readonly signal?: AbortSignal;
}

export function useAnalyzeEstimationPoc() {
  return useMutation({
    mutationFn: ({ onThoughtSummary, signal, ...input }: AnalyzeEstimationWithSummaries) =>
      onThoughtSummary
        ? estimationApi.analyzePocStream(input, onThoughtSummary, signal)
        : estimationApi.analyzePoc(input),
  });
}

export function useGenerateEstimationPocProposal() {
  return useMutation({
    mutationFn: (input: GenerateEstimationPocInput) => estimationApi.generatePocProposal(input),
  });
}

/** En R4-a exige cuestionario F01–F05 antes de producir la propuesta de PoC. */
export function useGenerateAnsweredEstimationPocProposal() {
  return useMutation({
    mutationFn: (input: GenerateEstimationPocInput) => estimationApi.generateAnsweredPocProposal(input),
  });
}

/** Análisis preliminar real por Gemini (el modo KDM mantiene fuente de demo). */
export function useEstimationDocumentAnalysis(
  input: AnalyzeEstimationPocInput | null, enabled: boolean,
) {
  return useQuery({
    queryKey: [...estimationKeys.questionnaireDefinition(), 'document-analysis',
      input?.projectId ?? '', input?.driveFolderUrl ?? '',
      input?.instructions ?? ''] as const,
    queryFn: () => {
      if (!input) throw new Error('No existe contexto documental para analizar.');
      return estimationApi.analyzePoc(input);
    },
    enabled: enabled && Boolean(input),
    retry: false,
    staleTime: 10 * 60_000,
  });
}
