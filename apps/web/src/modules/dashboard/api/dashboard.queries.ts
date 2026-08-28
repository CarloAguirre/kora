import { useQuery } from '@tanstack/react-query';
import { dashboardApi, dashboardKeys } from './dashboard.api';

export function useDashboardSummary(weekStart?: string) {
  return useQuery({
    queryKey: dashboardKeys.summary(weekStart),
    queryFn: () => dashboardApi.getSummary(weekStart),
    staleTime: 30_000,
  });
}
