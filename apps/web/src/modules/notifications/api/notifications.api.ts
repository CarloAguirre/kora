import type { ListNotificationsResponse } from '@kora/contracts';
import { api } from '@/shared/lib/api-client';

export const notificationsApi = {
  list(): Promise<ListNotificationsResponse> {
    return api.get<ListNotificationsResponse>('/notifications');
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
};
