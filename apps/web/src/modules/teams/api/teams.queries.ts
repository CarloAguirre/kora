import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddTeamMemberInput,
  CreateTeamInput,
  ListTeamsQuery,
  TeamAvailabilityQuery,
  UpdateTeamInput,
  UpdateTeamMemberInput,
} from '@kora/contracts';
import { teamKeys, teamsApi } from './teams.api';

export function useTeamsList(query: Partial<ListTeamsQuery>) {
  return useQuery({
    queryKey: teamKeys.list(query),
    queryFn: () => teamsApi.list(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
  });
}

export function useTeamDetail(teamId: string | null) {
  return useQuery({
    queryKey: teamKeys.detail(teamId ?? ''),
    queryFn: () => teamsApi.detail(teamId as string),
    enabled: Boolean(teamId),
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
