import type { LeaderReminders, ListNotificationsResponse } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const notificationsApi = {
  list(): Promise<ListNotificationsResponse> {
    return api.get<ListNotificationsResponse>('/notifications');
  },
  reminders(): Promise<LeaderReminders> {
    return api.get<LeaderReminders>('/reminders/me');
  },
  markRead(notificationId: string): Promise<void> {
    return api.patch<void>(`/notifications/${notificationId}/read`);
  },
  markAllRead(): Promise<void> {
    return api.post<void>('/notifications/read-all');
  },
};

export const notificationKeys = {
  all: ['notifications'] as const,
  /** Pendientes en vivo del líder. Cuelga de `all`: invalidar las notificaciones también los refresca. */
  reminders: ['notifications', 'reminders'] as const,
};
