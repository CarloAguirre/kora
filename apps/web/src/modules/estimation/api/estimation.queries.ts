import { useMutation, useQuery } from '@tanstack/react-query';
import type {
  AnalyzeEstimationPocInput,
  GenerateEstimationPocInput,
} from '@kora/contracts';
import { estimationApi, estimationKeys } from './estimation.api';

export function useEstimationQuestionnaireDefinition() {
  return useQuery({
    queryKey: estimationKeys.questionnaireDefinition(),
    queryFn: () => estimationApi.questionnaireDefinition(),
    staleTime: 5 * 60_000,
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

export function useAnalyzeEstimationPoc() {
  return useMutation({
    mutationFn: (input: AnalyzeEstimationPocInput) => estimationApi.analyzePoc(input),
  });
}

export function useGenerateEstimationPocProposal() {
  return useMutation({
    mutationFn: (input: GenerateEstimationPocInput) => estimationApi.generatePocProposal(input),
  });
}
