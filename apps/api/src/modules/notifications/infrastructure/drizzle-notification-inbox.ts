import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, lt, notifications, users, type Database } from '@kora/db';
import { notificationSchema, type Notification } from '@kora/contracts';
import type {
  CreateNotificationInput,
  NotificationInbox,
  OverdueNotification,
} from '../application/ports/notification-inbox.port';
import { DATABASE } from '../../../shared/infrastructure/database/database.module';

type NotificationRow = typeof notifications.$inferSelect;

/** Fila → contrato. Una fila cuyo `data` ya no calza con su tipo se descarta en vez de romper la campanita. */
function toNotification(row: NotificationRow): Notification | null {
  const parsed = notificationSchema.safeParse({
    id: row.id,
    type: row.type,
    title: row.title,
    data: row.data,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  });
  return parsed.success ? parsed.data : null;
}

@Injectable()
export class DrizzleNotificationInbox implements NotificationInbox {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(input: CreateNotificationInput): Promise<void> {
    await this.database.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      data: input.data as Record<string, unknown>,
      createdByUserId: input.createdByUserId,
    });
  }

  async listForUser(userId: string, limit: number): Promise<{ items: Notification[]; unreadCount: number }> {
    const [rows, unread] = await Promise.all([
      this.database
        .select()
        .from(notifications)
        .where(eq(notifications.userId, userId))
        .orderBy(desc(notifications.createdAt))
        .limit(limit),
      this.database
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt))),
    ]);
    return {
      items: rows.map(toNotification).filter((item): item is Notification => item !== null),
      unreadCount: Number(unread[0]?.value ?? 0),
    };
  }

  async markRead(userId: string, notificationId: string, now: Date): Promise<void> {
    await this.database
      .update(notifications)
      .set({ readAt: now, updatedAt: now })
      .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId), isNull(notifications.readAt)));
  }

  async markAllRead(userId: string, now: Date): Promise<void> {
    await this.database
      .update(notifications)
      .set({ readAt: now, updatedAt: now })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  }

  async claimOverdueForEmail(createdBefore: Date, now: Date): Promise<OverdueNotification[]> {
    const claimed = await this.database
      .update(notifications)
      .set({ emailedAt: now, updatedAt: now })
      .where(and(isNull(notifications.readAt), isNull(notifications.emailedAt), lt(notifications.createdAt, createdBefore)))
      .returning();
    if (claimed.length === 0) return [];

    const recipients = await this.database
      .select({ id: users.id, email: users.email, firstName: users.firstName })
      .from(users)
      .where(inArray(users.id, [...new Set(claimed.map((row) => row.userId))]));
    const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]));

    return claimed.flatMap((row) => {
      const notification = toNotification(row);
      const recipient = recipientById.get(row.userId);
      return notification && recipient
        ? [{ id: row.id, recipientEmail: recipient.email, recipientFirstName: recipient.firstName, notification }]
        : [];
    });
  }

  async releaseEmailClaim(notificationId: string): Promise<void> {
    await this.database.update(notifications).set({ emailedAt: null }).where(eq(notifications.id, notificationId));
  }
}
