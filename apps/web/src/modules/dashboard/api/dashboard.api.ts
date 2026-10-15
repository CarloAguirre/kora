import type { DashboardOvertimeReport, DashboardSummary } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const dashboardApi = {
  getSummary(weekStart?: string): Promise<DashboardSummary> {
    return api.get<DashboardSummary>('/dashboard/summary', { weekStart });
  },
  getOvertimeReport(year: number, month: number): Promise<DashboardOvertimeReport> {
    return api.get<DashboardOvertimeReport>('/dashboard/overtime-report', { year, month });
  },
};

export const dashboardKeys = {
  summary: (weekStart?: string) => ['dashboard', 'summary', weekStart ?? null] as const,
  overtimeReport: (year: number, month: number) => ['dashboard', 'overtime-report', year, month] as const,
};
