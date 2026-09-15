import type {
  AddProjectModuleDeliveryInput,
  AddProjectObservationInput,
  AssignProjectTeamMemberInput,
  ChangeProjectStatusInput,
  CreateProjectInput,
  CreateProjectModuleInput,
  CreateProjectModuleSegmentInput,
  CreateProjectModuleTaskInput,
  ListProjectsQuery,
  ListProjectsResponse,
  ProjectDetail,
  SetProjectOvertimeAuthorizationInput,
  UpdateProjectExtrasInput,
  UpdateProjectInput,
  UpdateProjectModuleDeliveryInput,
  UpdateProjectModuleInput,
  UpdateProjectModuleSegmentInput,
  UpdateProjectModuleTaskInput,
  UpdateProjectObservationInput,
  UpdateProjectTeamMemberInput,
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
  updateExtras(projectId: string, input: UpdateProjectExtrasInput): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/extras`, input);
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
  updateMember(projectId: string, assignmentId: string, input: UpdateProjectTeamMemberInput): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/members/${assignmentId}`, input);
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
  createModule(projectId: string, input: CreateProjectModuleInput): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/projects/${projectId}/modules`, input);
  },
  updateModule(projectId: string, moduleId: string, input: UpdateProjectModuleInput): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/modules/${moduleId}`, input);
  },
  deleteModule(projectId: string, moduleId: string): Promise<void> {
    return api.delete<void>(`/projects/${projectId}/modules/${moduleId}`);
  },
  addModuleDelivery(
    projectId: string,
    moduleId: string,
    input: AddProjectModuleDeliveryInput,
  ): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/projects/${projectId}/modules/${moduleId}/deliveries`, input);
  },
  removeModuleDelivery(projectId: string, moduleId: string, deliveryId: string): Promise<void> {
    return api.delete<void>(`/projects/${projectId}/modules/${moduleId}/deliveries/${deliveryId}`);
  },
  updateModuleDelivery(
    projectId: string,
    moduleId: string,
    deliveryId: string,
    input: UpdateProjectModuleDeliveryInput,
  ): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/modules/${moduleId}/deliveries/${deliveryId}`, input);
  },
  createModuleSegment(
    projectId: string,
    moduleId: string,
    input: CreateProjectModuleSegmentInput,
  ): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/projects/${projectId}/modules/${moduleId}/segments`, input);
  },
  updateModuleSegment(
    projectId: string,
    moduleId: string,
    segmentId: string,
    input: UpdateProjectModuleSegmentInput,
  ): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/modules/${moduleId}/segments/${segmentId}`, input);
  },
  deleteModuleSegment(projectId: string, moduleId: string, segmentId: string): Promise<void> {
    return api.delete<void>(`/projects/${projectId}/modules/${moduleId}/segments/${segmentId}`);
  },
  createModuleTask(projectId: string, moduleId: string, input: CreateProjectModuleTaskInput): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/projects/${projectId}/modules/${moduleId}/tasks`, input);
  },
  updateModuleTask(
    projectId: string,
    moduleId: string,
    taskId: string,
    input: UpdateProjectModuleTaskInput,
  ): Promise<void> {
    return api.patch<void>(`/projects/${projectId}/modules/${moduleId}/tasks/${taskId}`, input);
  },
  deleteModuleTask(projectId: string, moduleId: string, taskId: string): Promise<void> {
    return api.delete<void>(`/projects/${projectId}/modules/${moduleId}/tasks/${taskId}`);
  },
};

export const projectKeys = {
  all: ['projects'] as const,
  lists: () => [...projectKeys.all, 'list'] as const,
  list: (query: Partial<ListProjectsQuery>) => [...projectKeys.lists(), query] as const,
  details: () => [...projectKeys.all, 'detail'] as const,
  detail: (projectId: string) => [...projectKeys.details(), projectId] as const,
};
