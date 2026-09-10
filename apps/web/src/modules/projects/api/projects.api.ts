import type {
  AddProjectObservationInput,
  AssignProjectTeamMemberInput,
  ChangeProjectStatusInput,
  CreateProjectInput,
  ListProjectsQuery,
  ListProjectsResponse,
  ProjectDetail,
  SetProjectOvertimeAuthorizationInput,
  UpdateProjectInput,
  UpdateProjectObservationInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const projectsApi = {
  list(query: Partial<ListProjectsQuery>): Promise<ListProjectsResponse> {
    return api.get<ListProjectsResponse>('/projects', {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      type: query.type,
      status: query.status,
      phase: query.phase,
      clientId: query.clientId,
      leaderUserId: query.leaderUserId,
      assignedToUserId: query.assignedToUserId,
      teamId: query.teamId,
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
  },
  detail(projectId: string): Promise<ProjectDetail> {
    return api.get<ProjectDetail>(`/projects/${projectId}`);
  },
  create(input: CreateProjectInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/projects', input);
  },
  update(projectId: string, input: UpdateProjectInput): Promise<void> {
    return api.patch<void>(`/projects/${projectId}`, input);
  },
  changeStatus(projectId: string, input: ChangeProjectStatusInput): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/status`, input);
  },
  setOvertimeAuthorization(projectId: string, input: SetProjectOvertimeAuthorizationInput): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/overtime`, input);
  },
  remove(projectId: string): Promise<void> {
    return api.delete<void>(`/projects/${projectId}`);
  },
  assignMember(projectId: string, input: AssignProjectTeamMemberInput): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/projects/${projectId}/members`, input);
  },
  unassignMember(projectId: string, assignmentId: string): Promise<void> {
    return api.delete<void>(`/projects/${projectId}/members/${assignmentId}`);
  },
  addObservation(projectId: string, input: AddProjectObservationInput): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/projects/${projectId}/observations`, input);
  },
  updateObservation(projectId: string, observationId: string, input: UpdateProjectObservationInput): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/observations/${observationId}`, input);
  },
  removeObservation(projectId: string, observationId: string): Promise<void> {
    return api.delete<void>(`/projects/${projectId}/observations/${observationId}`);
  },
};

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (query: Partial<ListProjectsQuery>) => [...projectKeys.lists(), query] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (projectId: string) => [...projectKeys.details(), projectId] as const,
};
