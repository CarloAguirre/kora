import { useQuery } from '@tanstack/react-query';
import { estimationApi, estimationKeys } from './estimation.api';

export function useEstimationQuestionnaireDefinition() {
  return useQuery({
    queryKey: estimationKeys.questionnaireDefinition(),
    queryFn: () => estimationApi.questionnaireDefinition(),
    staleTime: 5 * 60_000,
  });
}
