import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddProjectObservationInput,
  AssignProjectTeamMemberInput,
  ChangeProjectStatusInput,
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from '@kora/contracts';
import { projectKeys, projectsApi } from './projects.api';

export function useProjectsList(query: Partial<ListProjectsQuery>) {
  return useQuery({
    queryKey: projectKeys.list(query),
    queryFn: () => projectsApi.list(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useProjectDetail(projectId: string | null) {
  return useQuery({
    queryKey: projectKeys.detail(projectId ?? ''),
    queryFn: () => projectsApi.detail(projectId as string),
    enabled: Boolean(projectId),
  });
}

function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: projectKeys.all });
    // El Dashboard resume proyectos/soporte: sin esto quedaba desactualizado
    // hasta que el usuario recargaba la página a mano.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (input: CreateProjectInput) => projectsApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: UpdateProjectInput }) =>
      projectsApi.update(projectId, input),
    onSuccess: () => invalidate(),
  });
}

export function useChangeProjectStatus() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: ChangeProjectStatusInput }) =>
      projectsApi.changeStatus(projectId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProject() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.remove(projectId),
    onSuccess: () => invalidate(),
  });
}

export function useAssignProjectMember() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: AssignProjectTeamMemberInput }) =>
      projectsApi.assignMember(projectId, input),
    onSuccess: () => invalidate(),
  });
}

export function useUnassignProjectMember() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, assignmentId }: { projectId: string; assignmentId: string }) =>
      projectsApi.unassignMember(projectId, assignmentId),
    onSuccess: () => invalidate(),
  });
}

export function useAddProjectObservation() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: AddProjectObservationInput }) =>
      projectsApi.addObservation(projectId, input),
    onSuccess: () => invalidate(),
  });
}
