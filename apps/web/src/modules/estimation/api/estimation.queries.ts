import { useMutation, useQuery } from '@tanstack/react-query';
import type { GenerateEstimationPocInput } from '@kora/contracts';
import { estimationApi, estimationKeys } from './estimation.api';

export function useEstimationQuestionnaireDefinition() {
  return useQuery({
    queryKey: estimationKeys.questionnaireDefinition(),
    queryFn: () => estimationApi.questionnaireDefinition(),
    staleTime: 5 * 60_000,
  });
}

export function useGenerateEstimationPocProposal() {
  return useMutation({
    mutationFn: (input: GenerateEstimationPocInput) => estimationApi.generatePocProposal(input),
  });
}
