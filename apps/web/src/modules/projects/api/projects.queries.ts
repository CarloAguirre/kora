import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddProjectModuleDeliveryInput,
  AddProjectObservationInput,
  AssignProjectTeamMemberInput,
  ChangeProjectStatusInput,
  CorrectProjectHito0DateInput,
  CreateProjectInput,
  CreateProjectModuleInput,
  CreateProjectModuleSegmentInput,
  CreateProjectModuleTaskInput,
  CreateProjectPaymentMilestoneInput,
  IssueProjectPaymentMilestoneInvoiceInput,
  ListProjectsQuery,
  MarkProjectPaymentMilestonePaidInput,
  ResolveProjectObservationInput,
  SetProjectOvertimeAuthorizationInput,
  UpdateProjectBillingSettingsInput,
  UpdateProjectExtrasInput,
  UpdateProjectInput,
  UpdateProjectModuleDeliveryInput,
  UpdateProjectModuleInput,
  UpdateProjectModuleSegmentInput,
  UpdateProjectModuleTaskInput,
  UpdateProjectObservationInput,
  UpdateProjectPaymentMilestoneInput,
  UpdateProjectTeamMemberInput,
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

/** Los tramos de ejecución generan filas de Forecast (y se borran en cascada con su tramo/fase). */
function useInvalidateProjectsAndForecast() {
  const queryClient = useQueryClient();
  const invalidateProjects = useInvalidateProjects();
  return () => {
    invalidateProjects();
    queryClient.invalidateQueries({ queryKey: ['forecast'] });
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

export function useUpdateProjectExtras() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: UpdateProjectExtrasInput }) =>
      projectsApi.updateExtras(projectId, input),
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

export function useSetProjectOvertimeAuthorization() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: SetProjectOvertimeAuthorizationInput }) =>
      projectsApi.setOvertimeAuthorization(projectId, input),
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

export function useUpdateProjectMember() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      assignmentId,
      input,
    }: {
      projectId: string;
      assignmentId: string;
      input: UpdateProjectTeamMemberInput;
    }) => projectsApi.updateMember(projectId, assignmentId, input),
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

export function useUpdateProjectObservation() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      observationId,
      input,
    }: {
      projectId: string;
      observationId: string;
      input: UpdateProjectObservationInput;
    }) => projectsApi.updateObservation(projectId, observationId, input),
    onSuccess: () => invalidate(),
  });
}

export function useResolveProjectObservation() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      observationId,
      input,
    }: {
      projectId: string;
      observationId: string;
      input: ResolveProjectObservationInput;
    }) => projectsApi.resolveObservation(projectId, observationId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProjectObservation() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, observationId }: { projectId: string; observationId: string }) =>
      projectsApi.removeObservation(projectId, observationId),
    onSuccess: () => invalidate(),
  });
}

export function useCreateProjectModule() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: CreateProjectModuleInput }) =>
      projectsApi.createModule(projectId, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProjectModule() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      input,
    }: {
      projectId: string;
      moduleId: string;
      input: UpdateProjectModuleInput;
    }) => projectsApi.updateModule(projectId, moduleId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProjectModule() {
  const invalidate = useInvalidateProjectsAndForecast();
  return useMutation({
    mutationFn: ({ projectId, moduleId }: { projectId: string; moduleId: string }) =>
      projectsApi.deleteModule(projectId, moduleId),
    onSuccess: () => invalidate(),
  });
}

export function useAddProjectModuleDelivery() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      input,
    }: {
      projectId: string;
      moduleId: string;
      input: AddProjectModuleDeliveryInput;
    }) => projectsApi.addModuleDelivery(projectId, moduleId, input),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveProjectModuleDelivery() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      deliveryId,
    }: {
      projectId: string;
      moduleId: string;
      deliveryId: string;
    }) => projectsApi.removeModuleDelivery(projectId, moduleId, deliveryId),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProjectModuleDelivery() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      deliveryId,
      input,
    }: {
      projectId: string;
      moduleId: string;
      deliveryId: string;
      input: UpdateProjectModuleDeliveryInput;
    }) => projectsApi.updateModuleDelivery(projectId, moduleId, deliveryId, input),
    onSuccess: () => invalidate(),
  });
}

export function useCreateProjectModuleSegment() {
  const invalidate = useInvalidateProjectsAndForecast();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      input,
    }: {
      projectId: string;
      moduleId: string;
      input: CreateProjectModuleSegmentInput;
    }) => projectsApi.createModuleSegment(projectId, moduleId, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProjectModuleSegment() {
  const invalidate = useInvalidateProjectsAndForecast();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      segmentId,
      input,
    }: {
      projectId: string;
      moduleId: string;
      segmentId: string;
      input: UpdateProjectModuleSegmentInput;
    }) => projectsApi.updateModuleSegment(projectId, moduleId, segmentId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProjectModuleSegment() {
  const invalidate = useInvalidateProjectsAndForecast();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      segmentId,
    }: {
      projectId: string;
      moduleId: string;
      segmentId: string;
    }) => projectsApi.deleteModuleSegment(projectId, moduleId, segmentId),
    onSuccess: () => invalidate(),
  });
}

export function useCreateProjectModuleTask() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      input,
    }: {
      projectId: string;
      moduleId: string;
      input: CreateProjectModuleTaskInput;
    }) => projectsApi.createModuleTask(projectId, moduleId, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProjectModuleTask() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      moduleId,
      taskId,
      input,
    }: {
      projectId: string;
      moduleId: string;
      taskId: string;
      input: UpdateProjectModuleTaskInput;
    }) => projectsApi.updateModuleTask(projectId, moduleId, taskId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProjectModuleTask() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, moduleId, taskId }: { projectId: string; moduleId: string; taskId: string }) =>
      projectsApi.deleteModuleTask(projectId, moduleId, taskId),
    onSuccess: () => invalidate(),
  });
}

export function useCreateProjectPaymentMilestone() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: CreateProjectPaymentMilestoneInput }) =>
      projectsApi.createPaymentMilestone(projectId, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateProjectPaymentMilestone() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      milestoneId,
      input,
    }: {
      projectId: string;
      milestoneId: string;
      input: UpdateProjectPaymentMilestoneInput;
    }) => projectsApi.updatePaymentMilestone(projectId, milestoneId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteProjectPaymentMilestone() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, milestoneId }: { projectId: string; milestoneId: string }) =>
      projectsApi.deletePaymentMilestone(projectId, milestoneId),
    onSuccess: () => invalidate(),
  });
}

export function useIssueProjectPaymentMilestoneInvoice() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      milestoneId,
      input,
    }: {
      projectId: string;
      milestoneId: string;
      input: IssueProjectPaymentMilestoneInvoiceInput;
    }) => projectsApi.issuePaymentMilestoneInvoice(projectId, milestoneId, input),
    onSuccess: () => invalidate(),
  });
}

export function useMarkProjectPaymentMilestonePaid() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({
      projectId,
      milestoneId,
      input,
    }: {
      projectId: string;
      milestoneId: string;
      input: MarkProjectPaymentMilestonePaidInput;
    }) => projectsApi.markPaymentMilestonePaid(projectId, milestoneId, input),
    onSuccess: () => invalidate(),
  });
}

export function useResolveProjectManagementApproval() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: (projectId: string) => projectsApi.resolveManagementApproval(projectId),
    onSuccess: () => invalidate(),
  });
}

export function useCorrectProjectHito0Date() {
  const invalidate = useInvalidateProjects();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: CorrectProjectHito0DateInput }) =>
      projectsApi.correctHito0Date(projectId, input),
    onSuccess: () => invalidate(),
  });
}

/** Interruptor global de Hito 0 — lo ve Finanzas (`billing:read`) y lo administra Gerencia (`projects:manage`). */
export function useProjectBillingSettings(enabled = true) {
  return useQuery({
    queryKey: projectKeys.billingSettings(),
    queryFn: () => projectsApi.getBillingSettings(),
    enabled,
  });
}

export function useUpdateProjectBillingSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProjectBillingSettingsInput) => projectsApi.updateBillingSettings(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectKeys.billingSettings() });
    },
  });
}
