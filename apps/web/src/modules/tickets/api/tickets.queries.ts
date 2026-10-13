import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChangeTicketStatusInput, CreateTicketInput, ListTicketsQuery, ProjectType, UpdateTicketInput } from '@kora/contracts';
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

/**
 * Proyectos de `type` del cliente elegido, para los selectores del modal de
 * ticket. Deliberadamente NO usa `useProjectsList`: ese hook pega a
 * `GET /projects`, que un colaborador o líder solo ve acotado a sus propios
 * proyectos asignados — un colaborador sin staffear en el proyecto de soporte
 * de un cliente nunca vería nada en el combobox. Sin cliente elegido no hay
 * qué listar (los proyectos siempre son de un cliente puntual).
 */
export function useTicketLinkableProjects(clientId: string | undefined, type: ProjectType) {
  return useQuery({
    queryKey: ticketKeys.linkableProjects({ clientId: clientId ?? '', type }),
    queryFn: () => ticketsApi.linkableProjects({ clientId: clientId as string, type }),
    enabled: Boolean(clientId),
  });
}

/**
 * Clientes para el filtro "Cliente" del tablero/historial y el selector del
 * modal de ticket. Deliberadamente NO usa `useClientsList`: `GET /clients`
 * exige `clients:read`, que un colaborador no tiene aunque sí pueda ver y
 * crear tickets — le respondía 403.
 */
export function useTicketLinkableClients() {
  return useQuery({
    queryKey: ticketKeys.linkableClients(),
    queryFn: () => ticketsApi.linkableClients(),
    staleTime: 60_000,
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
