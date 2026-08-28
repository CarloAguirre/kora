import type { SupportProjectSummary } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const supportPlanApi = {
  getSummaryForProject(projectId: string): Promise<SupportProjectSummary | null> {
    return api.get<SupportProjectSummary | null>(`/support-plans/project/${projectId}`);
  },
};

export const supportPlanKeys = {
  summary: (projectId: string) => ['support-plan', 'summary', projectId] as const,
};
