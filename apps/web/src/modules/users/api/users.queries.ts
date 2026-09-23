import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ChangeUserStatusInput,
  CreateUserInput,
  ListUsersQuery,
  UpdateUserInput,
} from '@kora/contracts';
import { userKeys, usersApi } from './users.api';

/**
 * Hooks de datos del módulo de usuarios.
 *
 * Los componentes no llaman a `fetch` ni gestionan estados de carga a mano:
 * piden datos con estos hooks y reciben `data`, `isLoading` y `error` ya
 * resueltos. En la v1 cada pantalla declaraba sus propios `useState` de
 * `loading`, `error` y `data`, y los sincronizaba dentro de un `useEffect` —
 * unas 30 líneas repetidas en cada una de las 20 pantallas, cada una con sus
 * propios fallos sutiles al desmontar o al llegar dos respuestas desordenadas.
 */

export function useUsersList(query: Partial<ListUsersQuery>, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: userKeys.list(query),
    queryFn: () => usersApi.list(query),
    // Mantiene la página anterior visible mientras carga la siguiente: sin
    // esto, cambiar de página vacía la tabla y la interfaz da un salto.
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useUserDetail(userId: string | null) {
  return useQuery({
    queryKey: userKeys.detail(userId ?? ''),
    queryFn: () => usersApi.detail(userId as string),
    enabled: Boolean(userId),
  });
}

/**
 * Invalidación compartida por todas las mutaciones.
 *
 * Cualquier escritura sobre un usuario puede alterar el listado (un cambio de
 * rol reordena, un cambio de estado cambia el filtro aplicable), así que se
 * invalida el módulo entero. Es una decisión consciente: afinar qué claves
 * concretas invalidar ahorraría alguna petición, a cambio de una clase de fallo
 * —datos obsoletos en pantalla— mucho más difícil de detectar que una consulta
 * de más.
 */
function useInvalidateUsers() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: userKeys.all });
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(input),
    onSuccess: () => invalidate(),
  });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: UpdateUserInput }) =>
      usersApi.update(userId, input),
    onSuccess: () => invalidate(),
  });
}

export function useChangeUserStatus() {
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: ({ userId, input }: { userId: string; input: ChangeUserStatusInput }) =>
      usersApi.changeStatus(userId, input),
    onSuccess: () => invalidate(),
  });
}

export function useGrantUserAccess() {
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: (userId: string) => usersApi.grantAccess(userId),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteUser() {
  const invalidate = useInvalidateUsers();

  return useMutation({
    mutationFn: (userId: string) => usersApi.remove(userId),
    onSuccess: () => invalidate(),
  });
}
