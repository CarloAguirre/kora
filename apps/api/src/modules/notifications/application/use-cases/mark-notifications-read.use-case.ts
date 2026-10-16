import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, ok, type Clock, type Result } from '@kora/core';
import { NOTIFICATION_INBOX, type NotificationInbox } from '../ports/notification-inbox.port';
import type { UseCase } from '../../../../shared/application/use-case';

export interface MarkNotificationsReadCommand {
  readonly userId: string;
  /** Sin id: todas las del usuario. Solo marca las propias — una ajena simplemente no cambia. */
  readonly notificationId?: string;
}

@Injectable()
export class MarkNotificationsReadUseCase implements UseCase<MarkNotificationsReadCommand, void, never> {
  constructor(
    @Inject(NOTIFICATION_INBOX) private readonly inbox: NotificationInbox,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute({ userId, notificationId }: MarkNotificationsReadCommand): Promise<Result<void, never>> {
    const now = this.clock.now();
    if (notificationId) await this.inbox.markRead(userId, notificationId, now);
    else await this.inbox.markAllRead(userId, now);
    return ok(undefined);
  }
}
