import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeTicketStatusInput, CreateTicketInput, ListTicketsQuery, UpdateTicketInput } from '@kora/contracts';
import { ticketKeys, ticketsApi } from './tickets.api';

export function useTicketsList(query: Partial<ListTicketsQuery>) {
  return useQuery({
    queryKey: ticketKeys.list(query),
    queryFn: () => ticketsApi.list(query),
    placeholderData: (previous) => previous,
    staleTime: 15_000,
  });
}

export function useTicketDetail(ticketId: string | null) {
  return useQuery({
    queryKey: ticketKeys.detail(ticketId ?? ''),
    queryFn: () => ticketsApi.detail(ticketId as string),
    enabled: Boolean(ticketId),
  });
}

function useInvalidateTickets() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    // El Dashboard resume tickets abiertos: sin esto quedaba desactualizado
    // hasta que el usuario recargaba la página a mano.
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };
}

export function useCreateTicket() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: (input: CreateTicketInput) => ticketsApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTicket() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: ({ ticketId, input }: { ticketId: string; input: UpdateTicketInput }) => ticketsApi.update(ticketId, input),
    onSuccess: () => invalidate(),
  });
}

export function useChangeTicketStatus() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: ({ ticketId, input }: { ticketId: string; input: ChangeTicketStatusInput }) => ticketsApi.changeStatus(ticketId, input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTicket() {
  const invalidate = useInvalidateTickets();
  return useMutation({
    mutationFn: (ticketId: string) => ticketsApi.remove(ticketId),
    onSuccess: () => invalidate(),
  });
}
