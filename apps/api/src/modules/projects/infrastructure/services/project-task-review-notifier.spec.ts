import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@kora/db';
import type { Logger } from '@kora/core';
import type { NotificationInbox } from '../../../notifications/application/ports/notification-inbox.port';
import { RecordingNotificationSender } from '../../../../test/fakes';
import { ProjectTaskReviewNotifier, type ProjectTaskReviewEvent } from './project-task-review-notifier';

const logger = {
  debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn(),
} as unknown as Logger;
const event: ProjectTaskReviewEvent = {
  kind: 'returned',
  projectId: 'project-1', moduleId: 'module-1', taskId: 'task-1',
  taskName: 'Mejoras en bitácora', assigneeUserId: 'collab-1',
  assigneeName: 'Claudio Flores', projectLeaderUserId: 'leader-1',
  actorUserId: 'leader-1', reason: 'Corregir validación',
};

function fixture() {
  const select = vi.fn()
    .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => [{
      name: 'Prueba Dev 2', slug: 'prueba-dev-2',
    }] }) }) }))
    .mockImplementationOnce(() => ({ from: () => ({ where: () => ({ limit: async () => [{
      firstName: 'Claudio', email: 'claudio@kabeli.cl',
    }] }) }) }));
  const db = { select } as unknown as Database;
  const inbox = { create: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationInbox;
  const sender = new RecordingNotificationSender();
  const notifier = new ProjectTaskReviewNotifier(db, inbox, sender, logger);
  return { notifier, inbox, sender, select };
}

describe('ProjectTaskReviewNotifier', () => {
  it('envía correo inmediato de devolución y registra la campanita sin duplicar el respaldo', async () => {
    const { notifier, inbox, sender } = fixture();
    await notifier.publish(event);
    expect(sender.projectTaskStatusEmails).toEqual([
      expect.objectContaining({ kind: 'returned', recipientEmail: 'claudio@kabeli.cl',
        taskName: 'Mejoras en bitácora', reason: 'Corregir validación' }),
    ]);
    expect(inbox.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'collab-1', type: 'task_returned', emailedAt: expect.any(Date),
      data: expect.objectContaining({ projectSlug: 'prueba-dev-2' }),
    }));
  });

  it('si falla el correo, conserva la notificación para el respaldo diferido', async () => {
    const { notifier, inbox, sender } = fixture();
    sender.shouldFail = true;
    await notifier.publish(event);
    expect(inbox.create).toHaveBeenCalledWith(expect.not.objectContaining({
      emailedAt: expect.any(Date),
    }));
  });

  it('tarea completada: avisa al líder en Kora sin correo inmediato', async () => {
    const { notifier, inbox, sender } = fixture();
    await notifier.publish({
      ...event, kind: 'review_requested', actorUserId: 'collab-1',
    });
    expect(sender.projectTaskStatusEmails).toHaveLength(0);
    expect(inbox.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'leader-1', type: 'task_review_requested',
      data: expect.objectContaining({ taskId: 'task-1' }),
    }));
  });

  it('no envía ni registra notificaciones a uno mismo', async () => {
    const { notifier, inbox, sender, select } = fixture();
    await notifier.publish({ ...event, actorUserId: 'collab-1' });
    expect(inbox.create).not.toHaveBeenCalled();
    expect(sender.projectTaskStatusEmails).toHaveLength(0);
    expect(select).not.toHaveBeenCalled();
  });
});
