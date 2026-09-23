import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeClientStatusInput,
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
} from '@kora/contracts';
import { clientKeys, clientsApi } from './clients.api';

export function useClientsList(query: Partial<ListClientsQuery>, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: clientKeys.list(query),
    queryFn: () => clientsApi.list(query),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useClientDetail(clientId: string | null) {
  return useQuery({
    queryKey: clientKeys.detail(clientId ?? ''),
    queryFn: () => clientsApi.detail(clientId as string),
    enabled: Boolean(clientId),
  });
}

export function useClientsStats() {
  return useQuery({
    queryKey: clientKeys.stats(),
    queryFn: () => clientsApi.stats(),
    staleTime: 30_000,
  });
}

export function useClientFormOptions() {
  return useQuery({
    queryKey: clientKeys.formOptions(),
    queryFn: () => clientsApi.formOptions(),
    // Los catálogos casi no cambian: no vale la pena repetir la consulta cada
    // vez que se abre el formulario dentro de la misma sesión.
    staleTime: 5 * 60_000,
  });
}

function useInvalidateClients() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: clientKeys.all });
}

export function useCreateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (input: CreateClientInput) => clientsApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ clientId, input }: { clientId: string; input: UpdateClientInput }) =>
      clientsApi.update(clientId, input),
    onSuccess: () => invalidate(),
  });
}

export function useChangeClientStatus() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ clientId, input }: { clientId: string; input: ChangeClientStatusInput }) =>
      clientsApi.changeStatus(clientId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (clientId: string) => clientsApi.remove(clientId),
    onSuccess: () => invalidate(),
  });
}
