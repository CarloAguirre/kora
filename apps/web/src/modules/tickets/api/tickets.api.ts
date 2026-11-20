import type {
  ChangeTicketStatusInput,
  CreateTicketInput,
  ListTicketLinkableProjectsQuery,
  ListTicketsQuery,
  ListTicketsResponse,
  TicketDailyHours,
  TicketDetail,
  TicketLinkableClient,
  TicketLinkableProject,
  UpdateTicketInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

function filterParams(query: Partial<ListTicketsQuery>) {
  return {
    search: query.search || undefined,
    clientId: query.clientId,
    projectId: query.projectId,
    assigneeUserId: query.assigneeUserId,
    leaderUserId: query.leaderUserId,
    status: query.status,
    priority: query.priority,
    month: query.month,
  };
}

export const ticketsApi = {
  list(query: Partial<ListTicketsQuery>): Promise<ListTicketsResponse> {
    return api.get<ListTicketsResponse>('/tickets', {
      page: query.page,
      pageSize: query.pageSize,
      ...filterParams(query),
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
  },
  /** HH aprobadas por ticket + día + persona de TODOS los tickets del filtro (sin paginar) — para el Excel del historial. */
  dailyHours(query: Partial<ListTicketsQuery>): Promise<TicketDailyHours[]> {
    return api.get<TicketDailyHours[]>('/tickets/daily-hours', filterParams(query));
  },
  detail(ticketId: string): Promise<TicketDetail> {
    return api.get<TicketDetail>(`/tickets/${ticketId}`);
  },
  linkableProjects(query: ListTicketLinkableProjectsQuery): Promise<TicketLinkableProject[]> {
    return api.get<TicketLinkableProject[]>('/tickets/linkable-projects', {
      clientId: query.clientId,
      type: query.type,
      supportProjectId: query.supportProjectId,
    });
  },
  linkableClients(): Promise<TicketLinkableClient[]> {
    return api.get<TicketLinkableClient[]>('/tickets/linkable-clients');
  },
  create(input: CreateTicketInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/tickets', input);
  },
  update(ticketId: string, input: UpdateTicketInput): Promise<void> {
    return api.patch<void>(`/tickets/${ticketId}`, input);
  },
  changeStatus(ticketId: string, input: ChangeTicketStatusInput): Promise<void> {
    return api.patch<void>(`/tickets/${ticketId}/status`, input);
  },
  remove(ticketId: string): Promise<void> {
    return api.delete<void>(`/tickets/${ticketId}`);
  },
};

export const ticketKeys = {
  all: ['tickets'] as const,
  lists: () => [...ticketKeys.all, 'list'] as const,
  list: (query: Partial<ListTicketsQuery>) => [...ticketKeys.lists(), query] as const,
  details: () => [...ticketKeys.all, 'detail'] as const,
  detail: (ticketId: string) => [...ticketKeys.details(), ticketId] as const,
  linkableProjects: (query: ListTicketLinkableProjectsQuery) => [...ticketKeys.all, 'linkable-projects', query] as const,
  linkableClients: () => [...ticketKeys.all, 'linkable-clients'] as const,
};
