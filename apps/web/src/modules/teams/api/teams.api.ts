import type {
  AddTeamMemberInput,
  CreateTeamInput,
  CreateTeamTypeInput,
  ListTeamMemberOptionsResponse,
  ListTeamsQuery,
  ListTeamsResponse,
  ListTeamTypesResponse,
  RequestTeamReportDataInput,
  RequestTeamReportDataResponse,
  TeamAvailabilityQuery,
  TeamAvailabilityResponse,
  TeamDetail,
  TeamReportQuery,
  TeamReportResponse,
  UpdateTeamInput,
  UpdateTeamMemberInput,
  UpdateTeamTypeInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const teamsApi = {
  list(query: Partial<ListTeamsQuery>): Promise<ListTeamsResponse> {
    return api.get<ListTeamsResponse>('/teams', {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      isActive: query.isActive === undefined ? undefined : String(query.isActive),
      leaderUserId: query.leaderUserId,
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
  },
  detail(teamId: string): Promise<TeamDetail> {
    return api.get<TeamDetail>(`/teams/${teamId}`);
  },
  memberOptions(): Promise<ListTeamMemberOptionsResponse> {
    return api.get<ListTeamMemberOptionsResponse>('/teams/members');
  },
  availability(teamId: string, query: TeamAvailabilityQuery): Promise<TeamAvailabilityResponse> {
    return api.get<TeamAvailabilityResponse>(`/teams/${teamId}/availability`, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  },
  report(teamId: string, query: TeamReportQuery): Promise<TeamReportResponse> {
    return api.get<TeamReportResponse>(`/teams/${teamId}/report`, { dateFrom: query.dateFrom, dateTo: query.dateTo });
  },
  updateReportComment(teamId: string, projectId: string, comment: string): Promise<void> {
    return api.patch<void>(`/teams/${teamId}/report/projects/${projectId}/comment`, { comment });
  },
  requestReportData(teamId: string, input: RequestTeamReportDataInput): Promise<RequestTeamReportDataResponse> {
    return api.post<RequestTeamReportDataResponse>(`/teams/${teamId}/report/data-requests`, input);
  },
  create(input: CreateTeamInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/teams', input);
  },
  update(teamId: string, input: UpdateTeamInput): Promise<void> {
    return api.patch<void>(`/teams/${teamId}`, input);
  },
  remove(teamId: string): Promise<void> {
    return api.delete<void>(`/teams/${teamId}`);
  },
  addMember(teamId: string, input: AddTeamMemberInput): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/teams/${teamId}/members`, input);
  },
  updateMember(teamId: string, memberId: string, input: UpdateTeamMemberInput): Promise<void> {
    return api.patch<void>(`/teams/${teamId}/members/${memberId}`, input);
  },
  removeMember(teamId: string, memberId: string): Promise<void> {
    return api.delete<void>(`/teams/${teamId}/members/${memberId}`);
  },
};

export const teamTypesApi = {
  list(): Promise<ListTeamTypesResponse> {
    return api.get<ListTeamTypesResponse>('/teams/types');
  },
  create(input: CreateTeamTypeInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/teams/types', input);
  },
  update(typeId: string, input: UpdateTeamTypeInput): Promise<void> {
    return api.patch<void>(`/teams/types/${typeId}`, input);
  },
  remove(typeId: string): Promise<void> {
    return api.delete<void>(`/teams/types/${typeId}`);
  },
};

export const teamKeys = {
  all: ['teams'] as const,
  lists: () => [...teamKeys.all, 'list'] as const,
  list: (query: Partial<ListTeamsQuery>) => [...teamKeys.lists(), query] as const,
  details: () => [...teamKeys.all, 'detail'] as const,
  detail: (teamId: string) => [...teamKeys.details(), teamId] as const,
  memberOptions: () => [...teamKeys.all, 'member-options'] as const,
  availability: (teamId: string, query: TeamAvailabilityQuery) =>
    [...teamKeys.all, 'availability', teamId, query] as const,
  reports: (teamId: string) => [...teamKeys.all, 'report', teamId] as const,
  report: (teamId: string, query: TeamReportQuery) => [...teamKeys.reports(teamId), query] as const,
  types: () => [...teamKeys.all, 'types'] as const,
};
