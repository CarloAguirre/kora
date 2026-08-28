import type {
  ChangeUserStatusInput,
  CreateUserInput,
  ListUsersQuery,
  ListUsersResponse,
  UpdateUserInput,
  UserDetail,
} from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

/**
 * Llamadas HTTP del módulo de usuarios.
 *
 * Es la única capa del front que conoce las rutas de la API. Los componentes
 * llaman a los hooks, los hooks llaman aquí, y aquí se habla con el servidor.
 * Cambiar una ruta o el nombre de un parámetro se resuelve en este archivo.
 *
 * Los tipos vienen de `@kora/contracts`, los mismos que usa el backend: si el
 * servidor cambia la forma de una respuesta, esto deja de compilar. Es
 * exactamente el fallo que se quiere: en tiempo de compilación y no en
 * producción, que es donde aparecía en la v1 al consultar Supabase con `any`.
 */
export const usersApi = {
  list(query: Partial<ListUsersQuery>): Promise<ListUsersResponse> {
    return api.get<ListUsersResponse>('/users', {
      page: query.page,
      pageSize: query.pageSize,
      search: query.search || undefined,
      role: query.role,
      status: query.status,
      teamId: query.teamId,
      isCommercialManager:
        query.isCommercialManager === undefined ? undefined : String(query.isCommercialManager),
      sortField: query.sortField,
      sortDirection: query.sortDirection,
    });
  },

  detail(userId: string): Promise<UserDetail> {
    return api.get<UserDetail>(`/users/${userId}`);
  },

  create(input: CreateUserInput): Promise<{ id: string; invitationSent: boolean }> {
    return api.post<{ id: string; invitationSent: boolean }>('/users', input);
  },

  update(userId: string, input: UpdateUserInput): Promise<void> {
    return api.patch<void>(`/users/${userId}`, input);
  },

  changeStatus(userId: string, input: ChangeUserStatusInput): Promise<void> {
    return api.patch<void>(`/users/${userId}/status`, input);
  },

  grantAccess(userId: string): Promise<{ invitationSent: boolean; expiresAt: string }> {
    return api.post<{ invitationSent: boolean; expiresAt: string }>(`/users/${userId}/access`);
  },

  remove(userId: string): Promise<void> {
    return api.delete<void>(`/users/${userId}`);
  },
};

/**
 * Claves de caché.
 *
 * Centralizarlas evita el error clásico de invalidar `['users']` en un sitio y
 * `['usuarios']` en otro, con el resultado de una tabla que no se refresca tras
 * guardar y nadie entiende por qué.
 */
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (query: Partial<ListUsersQuery>) => [...userKeys.lists(), query] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (userId: string) => [...userKeys.details(), userId] as const,
};
