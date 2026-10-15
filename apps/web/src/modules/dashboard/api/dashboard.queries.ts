import { useQuery } from '@tanstack/react-query';
import { dashboardApi, dashboardKeys } from './dashboard.api';

export function useOvertimeReport(year: number, month: number, enabled = true) {
  return useQuery({
    queryKey: dashboardKeys.overtimeReport(year, month),
    queryFn: () => dashboardApi.getOvertimeReport(year, month),
    staleTime: 30_000,
    enabled,
  });
}

export function useDashboardSummary(weekStart?: string) {
  return useQuery({
    queryKey: dashboardKeys.summary(weekStart),
    queryFn: () => dashboardApi.getSummary(weekStart),
    staleTime: 30_000,
  });
}
