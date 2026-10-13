import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTicketHhRequestInput, RejectTicketHhRequestInput } from '@kora/contracts';
import { ticketHhRequestKeys, ticketHhRequestsApi } from './ticket-hh-requests.api';
import { ticketKeys } from './tickets.api';
import { hourKeys } from '@/modules/hours/api/hours.api';

export function useTicketHhRequestsList(ticketId: string | null) {
  return useQuery({
    queryKey: ticketHhRequestKeys.list(ticketId ?? ''),
    queryFn: () => ticketHhRequestsApi.list(ticketId as string),
    enabled: Boolean(ticketId),
  });
}

function useInvalidateTicketHhRequests(ticketId: string) {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ticketHhRequestKeys.list(ticketId) });
    // Detalle y listado: las tarjetas del tablero muestran el chip "Xh por
    // aprobar" y las HH utilizadas, que quedaban viejos hasta recargar.
    void queryClient.invalidateQueries({ queryKey: ticketKeys.all });
    // Aprobar genera un `hour_entries` — refresca Horas y el tope diario del formulario.
    void queryClient.invalidateQueries({ queryKey: hourKeys.all });
  };
}

export function useCreateTicketHhRequest(ticketId: string) {
  const invalidate = useInvalidateTicketHhRequests(ticketId);
  return useMutation({
    mutationFn: (input: CreateTicketHhRequestInput) => ticketHhRequestsApi.create(ticketId, input),
    onSuccess: () => invalidate(),
  });
}

export function useApproveTicketHhRequest(ticketId: string) {
  const invalidate = useInvalidateTicketHhRequests(ticketId);
  return useMutation({
    mutationFn: (requestId: string) => ticketHhRequestsApi.approve(ticketId, requestId),
    onSuccess: () => invalidate(),
  });
}

export function useRejectTicketHhRequest(ticketId: string) {
  const invalidate = useInvalidateTicketHhRequests(ticketId);
  return useMutation({
    mutationFn: ({ requestId, input }: { requestId: string; input: RejectTicketHhRequestInput }) =>
      ticketHhRequestsApi.reject(ticketId, requestId, input),
    onSuccess: () => invalidate(),
  });
}
