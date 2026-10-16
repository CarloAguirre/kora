import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddTeamMemberInput,
  CreateTeamInput,
  CreateTeamTypeInput,
  ListTeamsQuery,
  RequestTeamReportDataInput,
  TeamAvailabilityQuery,
  TeamReportQuery,
  TeamReportResponse,
  UpdateTeamInput,
  UpdateTeamMemberInput,
} from '@kora/contracts';
import { teamKeys, teamsApi, teamTypesApi } from './teams.api';

export function useTeamsList(query: Partial<ListTeamsQuery>, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: teamKeys.list(query),
    queryFn: () => teamsApi.list(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useTeamDetail(teamId: string | null) {
  return useQuery({
    queryKey: teamKeys.detail(teamId ?? ''),
    queryFn: () => teamsApi.detail(teamId as string),
    enabled: Boolean(teamId),
  });
}

export function useTeamMemberOptions() {
  return useQuery({
    queryKey: teamKeys.memberOptions(),
    queryFn: () => teamsApi.memberOptions(),
    staleTime: 30_000,
  });
}

export function useTeamAvailability(teamId: string | null, query: TeamAvailabilityQuery) {
  return useQuery({
    queryKey: teamKeys.availability(teamId ?? '', query),
    queryFn: () => teamsApi.availability(teamId as string, query),
    enabled: Boolean(teamId),
    placeholderData: (previous) => previous,
  });
}

export function useTeamReport(teamId: string | null, query: TeamReportQuery) {
  return useQuery({
    queryKey: teamKeys.report(teamId ?? '', query),
    queryFn: () => teamsApi.report(teamId as string, query),
    enabled: Boolean(teamId),
    placeholderData: (previous) => previous,
  });
}

/**
 * Guarda el comentario de un proyecto en el reporte. Actualiza en el lugar las copias en
 * caché del reporte de ese equipo (todos los períodos) en vez de volver a pedirlo: el
 * comentario no afecta ningún cálculo.
 */
export function useUpdateTeamReportComment(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, comment }: { projectId: string; comment: string }) =>
      teamsApi.updateReportComment(teamId, projectId, comment),
    onSuccess: (_data, { projectId, comment }) => {
      queryClient.setQueriesData<TeamReportResponse>({ queryKey: teamKeys.reports(teamId) }, (report) =>
        report
          ? {
              ...report,
              projects: report.projects.map((project) =>
                project.projectId === projectId ? { ...project, comment: comment.trim() || null } : project,
              ),
            }
          : report,
      );
    },
  });
}

/** "Pedir datos a los Líderes PM" — al volver, el reporte se recarga para mostrar las marcas "Solicitada". */
export function useRequestTeamReportData(teamId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RequestTeamReportDataInput) => teamsApi.requestReportData(teamId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.reports(teamId) }),
  });
}

function useInvalidateTeams() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: teamKeys.all });
    // El Dashboard resume capacidad por equipo: sin esto quedaba desactualizado
    // hasta que el usuario recargaba la página a mano.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: (input: CreateTeamInput) => teamsApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: ({ teamId, input }: { teamId: string; input: UpdateTeamInput }) =>
      teamsApi.update(teamId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTeam() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: (teamId: string) => teamsApi.remove(teamId),
    onSuccess: () => invalidate(),
  });
}

export function useAddTeamMember() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: ({ teamId, input }: { teamId: string; input: AddTeamMemberInput }) =>
      teamsApi.addMember(teamId, input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTeamMember() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: ({
      teamId,
      memberId,
      input,
    }: {
      teamId: string;
      memberId: string;
      input: UpdateTeamMemberInput;
    }) => teamsApi.updateMember(teamId, memberId, input),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveTeamMember() {
  const invalidate = useInvalidateTeams();
  return useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: string; memberId: string }) =>
      teamsApi.removeMember(teamId, memberId),
    onSuccess: () => invalidate(),
  });
}

/** Catálogo de tipos de equipo: cambia poco, así que tolera datos más viejos. */
export function useTeamTypes() {
  return useQuery({
    queryKey: teamKeys.types(),
    queryFn: () => teamTypesApi.list(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateTeamType() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTeamTypeInput) => teamTypesApi.create(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: teamKeys.types() }),
  });
}
