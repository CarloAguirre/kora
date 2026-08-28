import type { DashboardSummary } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const dashboardApi = {
  getSummary(weekStart?: string): Promise<DashboardSummary> {
    return api.get<DashboardSummary>('/dashboard/summary', { weekStart });
  },
};

export const dashboardKeys = {
  summary: (weekStart?: string) => ['dashboard', 'summary', weekStart ?? null] as const,
};
