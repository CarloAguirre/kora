import type { CreateTicketHhRequestInput, RejectTicketHhRequestInput, TicketHhRequest } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const ticketHhRequestsApi = {
  list(ticketId: string): Promise<TicketHhRequest[]> {
    return api.get<TicketHhRequest[]>(`/tickets/${ticketId}/hh-requests`);
  },
  create(ticketId: string, input: CreateTicketHhRequestInput): Promise<{ id: string }> {
    return api.post<{ id: string }>(`/tickets/${ticketId}/hh-requests`, input);
  },
  approve(ticketId: string, requestId: string): Promise<void> {
    return api.patch<void>(`/tickets/${ticketId}/hh-requests/${requestId}/approve`);
  },
  reject(ticketId: string, requestId: string, input: RejectTicketHhRequestInput): Promise<void> {
    return api.patch<void>(`/tickets/${ticketId}/hh-requests/${requestId}/reject`, input);
  },
};

export const ticketHhRequestKeys = {
  all: ['ticket-hh-requests'] as const,
  list: (ticketId: string) => [...ticketHhRequestKeys.all, ticketId] as const,
};
