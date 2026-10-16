import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from '@kora/core';
import type { ListNotificationsResponse } from '@kora/contracts';
import { NOTIFICATION_INBOX, type NotificationInbox } from '../ports/notification-inbox.port';
import type { UseCase } from '../../../../shared/application/use-case';

/** Las más recientes alcanzan para la campanita; no hay "ver todas" paginado. */
const LIMIT = 30;

@Injectable()
export class ListNotificationsUseCase implements UseCase<{ userId: string }, ListNotificationsResponse, never> {
  constructor(@Inject(NOTIFICATION_INBOX) private readonly inbox: NotificationInbox) {}

  async execute({ userId }: { userId: string }): Promise<Result<ListNotificationsResponse, never>> {
    return ok(await this.inbox.listForUser(userId, LIMIT));
  }
}
