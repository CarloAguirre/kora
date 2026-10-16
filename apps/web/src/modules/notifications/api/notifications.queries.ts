import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ListNotificationsResponse } from '@kora/contracts';
import { notificationKeys, notificationsApi } from './notifications.api';

/** Sin websockets: la campanita consulta cada minuto (y al volver a la pestaña). */
const POLL_INTERVAL_MS = 60_000;

export function useNotifications() {
  return useQuery({
    queryKey: notificationKeys.all,
    queryFn: () => notificationsApi.list(),
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

/** Marca leída una (con id) o todas — actualiza la caché al tiro para que el contador baje sin esperar al servidor. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId?: string) =>
      notificationId ? notificationsApi.markRead(notificationId) : notificationsApi.markAllRead(),
    onMutate: (notificationId) => {
      const readAt = new Date().toISOString();
      queryClient.setQueryData<ListNotificationsResponse>(notificationKeys.all, (current) => {
        if (!current) return current;
        const items = current.items.map((item) =>
          !item.readAt && (!notificationId || item.id === notificationId) ? { ...item, readAt } : item,
        );
        return { items, unreadCount: items.filter((item) => !item.readAt).length };
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}
