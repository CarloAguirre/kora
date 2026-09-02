import type {
  AddTeamMemberInput,
  CreateTeamInput,
  ListTeamMemberOptionsResponse,
  ListTeamsQuery,
  ListTeamsResponse,
  TeamAvailabilityQuery,
  TeamAvailabilityResponse,
  TeamDetail,
  UpdateTeamInput,
  UpdateTeamMemberInput,
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

export const teamKeys = {
  all: ['teams'] as const,
  lists: () => [...teamKeys.all, 'list'] as const,
  list: (query: Partial<ListTeamsQuery>) => [...teamKeys.lists(), query] as const,
  details: () => [...teamKeys.all, 'detail'] as const,
  detail: (teamId: string) => [...teamKeys.details(), teamId] as const,
  memberOptions: () => [...teamKeys.all, 'member-options'] as const,
  availability: (teamId: string, query: TeamAvailabilityQuery) =>
    [...teamKeys.all, 'availability', teamId, query] as const,
};
