import type {
  AvailabilityQuery,
  AvailabilityResponse,
  CreateHourEntryInput,
  Holiday,
  HourEntryDetail,
  ListCapacityReportQuery,
  ListCapacityReportResponse,
  ListHolidaysQuery,
  ListHourEntriesQuery,
  ListHourEntriesResponse,
  ProjectPendingApprovalsResponse,
  RejectHourEntryInput,
  UpdateHourEntryInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const hoursApi = {
  list(query: Partial<ListHourEntriesQuery>): Promise<ListHourEntriesResponse> {
    return api.get<ListHourEntriesResponse>('/hour-entries', {
      page: query.page,
      pageSize: query.pageSize,
      userId: query.userId,
      search: query.search || undefined,
      teamId: query.teamId,
      projectId: query.projectId,
      status: query.status,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
  },
  detail(entryId: string): Promise<HourEntryDetail> {
    return api.get<HourEntryDetail>(`/hour-entries/${entryId}`);
  },
  create(input: CreateHourEntryInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/hour-entries', input);
  },
  update(entryId: string, input: UpdateHourEntryInput): Promise<void> {
    return api.patch<void>(`/hour-entries/${entryId}`, input);
  },
  approve(entryId: string): Promise<void> {
    return api.patch<void>(`/hour-entries/${entryId}/approve`, {});
  },
  reject(entryId: string, input: RejectHourEntryInput): Promise<void> {
    return api.patch<void>(`/hour-entries/${entryId}/reject`, input);
  },
  remove(entryId: string): Promise<void> {
    return api.delete<void>(`/hour-entries/${entryId}`);
  },
  projectPendingApprovals(projectId: string): Promise<ProjectPendingApprovalsResponse> {
    return api.get<ProjectPendingApprovalsResponse>(`/hour-entries/projects/${projectId}/pending-approvals`);
  },
  holidays(query: Partial<ListHolidaysQuery>): Promise<Holiday[]> {
    return api.get<Holiday[]>('/holidays', { dateFrom: query.dateFrom, dateTo: query.dateTo });
  },
  capacityReport(query: Partial<ListCapacityReportQuery>): Promise<ListCapacityReportResponse> {
    return api.get<ListCapacityReportResponse>('/hour-entries/capacity-report', {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      periodStart: query.periodStart,
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
  },
  availability(query: Partial<AvailabilityQuery>): Promise<AvailabilityResponse> {
    return api.get<AvailabilityResponse>('/hour-entries/availability', {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      search: query.search || undefined,
      role: query.role,
      teamId: query.teamId,
    });
  },
};

export const hourKeys = {
  all: ['hour-entries'] as const,
  lists: () => [...hourKeys.all, 'list'] as const,
  list: (query: Partial<ListHourEntriesQuery>) => [...hourKeys.lists(), query] as const,
  details: () => [...hourKeys.all, 'detail'] as const,
  detail: (entryId: string) => [...hourKeys.details(), entryId] as const,
  holidays: (query: Partial<ListHolidaysQuery>) => [...hourKeys.all, 'holidays', query] as const,
  projectPendingApprovals: (projectId: string) => [...hourKeys.all, 'project-pending-approvals', projectId] as const,
  capacityReport: (query: Partial<ListCapacityReportQuery>) => [...hourKeys.all, 'capacity-report', query] as const,
  availability: (query: Partial<AvailabilityQuery>) => [...hourKeys.all, 'availability', query] as const,
};
