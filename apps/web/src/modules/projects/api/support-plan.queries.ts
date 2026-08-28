import { useQuery } from '@tanstack/react-query';
import { supportPlanApi, supportPlanKeys } from './support-plan.api';

export function useSupportPlanSummary(projectId: string | null) {
  return useQuery({
    queryKey: supportPlanKeys.summary(projectId ?? ''),
    queryFn: () => supportPlanApi.getSummaryForProject(projectId as string),
    enabled: Boolean(projectId),
  });
}
