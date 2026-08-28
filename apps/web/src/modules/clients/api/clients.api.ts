import type {
  ChangeClientStatusInput,
  ClientDetail,
  ClientsStats,
  CreateClientInput,
  ListClientsQuery,
  ListClientsResponse,
  UpdateClientInput,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';
import type { ClientFormOptions } from './client-form-options.types';

export const clientsApi = {
  list(query: Partial<ListClientsQuery>): Promise<ListClientsResponse> {
    return api.get<ListClientsResponse>('/clients', {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      status: query.status,
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
  },

  detail(clientId: string): Promise<ClientDetail> {
    return api.get<ClientDetail>(`/clients/${clientId}`);
  },

  formOptions(): Promise<ClientFormOptions> {
    return api.get<ClientFormOptions>('/clients/form-options');
  },

  stats(): Promise<ClientsStats> {
    return api.get<ClientsStats>('/clients/stats');
  },

  create(input: CreateClientInput): Promise<{ id: string }> {
    return api.post<{ id: string }>('/clients', input);
  },

  update(clientId: string, input: UpdateClientInput): Promise<void> {
    return api.patch<void>(`/clients/${clientId}`, input);
  },

  changeStatus(
    clientId: string,
    input: ChangeClientStatusInput,
  ): Promise<{ affectedProjects: number }> {
    return api.patch<{ affectedProjects: number }>(`/clients/${clientId}/status`, input);
  },

  remove(clientId: string): Promise<void> {
    return api.delete<void>(`/clients/${clientId}`);
  },
};

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (query: Partial<ListClientsQuery>) => [...clientKeys.lists(), query] as const,
  details: () => [...clientKeys.all, 'detail'] as const,
  detail: (clientId: string) => [...clientKeys.details(), clientId] as const,
  formOptions: () => [...clientKeys.all, 'form-options'] as const,
  stats: () => [...clientKeys.all, 'stats'] as const,
};
