import { describe, expect, it, vi } from 'vitest';
import type { Logger } from '@kora/core';
import { FixedClock, RecordingNotificationSender } from '../../../../test/fakes';
import type { NotificationInbox, OverdueNotification } from '../ports/notification-inbox.port';
import { SendOverdueNotificationEmailsUseCase } from './send-overdue-notification-emails.use-case';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

const NOW = new Date('2026-10-18T15:00:00.000Z');

function overdue(id: string, email: string): OverdueNotification {
  return {
    id,
    recipientEmail: email,
    recipientFirstName: 'José',
    notification: {
      id,
      type: 'team_report_data_request',
      title: 'Eduardo Aranda (UX-UI) te pide completar datos de 1 proyecto',
      readAt: null,
      createdAt: '2026-10-16T12:00:00.000Z',
      data: {
        teamId: '11111111-1111-4111-8111-111111111111',
        teamName: 'UX-UI',
        requestedBy: { id: '22222222-2222-4222-8222-222222222222', fullName: 'Eduardo Aranda' },
        note: null,
        items: [
          {
            projectId: '33333333-3333-4333-8333-333333333333',
            projectSlug: 'aurelia-spr',
            projectName: 'AurelIA - SPR',
            clientName: 'Goldfields',
            missing: ['assigned_hours', 'dates'],
          },
        ],
      },
    },
  };
}

describe('SendOverdueNotificationEmailsUseCase', () => {
  it('reclama las notificaciones sin abrir de hace más de 48 h y manda el correo', async () => {
    const sender = new RecordingNotificationSender();
    const inbox = {
      claimOverdueForEmail: vi.fn().mockResolvedValue([overdue('n1', 'jose@kabeli.cl')]),
      releaseEmailClaim: vi.fn(),
    };
    const useCase = new SendOverdueNotificationEmailsUseCase(inbox as unknown as NotificationInbox, sender, new FixedClock(NOW), silentLogger);

    expect((await useCase.execute()).unwrap()).toEqual({ sent: 1, failed: 0 });
    expect(inbox.claimOverdueForEmail).toHaveBeenCalledWith(new Date('2026-10-16T15:00:00.000Z'), NOW);
    expect(sender.teamReportDataRequests[0]).toMatchObject({
      recipientEmail: 'jose@kabeli.cl',
      requestedByName: 'Eduardo Aranda',
      items: [{ projectSlug: 'aurelia-spr', missing: 'sin HH asignadas y sin fechas' }],
    });
  });

  it('si el correo falla, libera la marca para reintentar en la próxima pasada', async () => {
    const sender = new RecordingNotificationSender();
    sender.shouldFail = true;
    const inbox = {
      claimOverdueForEmail: vi.fn().mockResolvedValue([overdue('n1', 'jose@kabeli.cl')]),
      releaseEmailClaim: vi.fn(),
    };
    const useCase = new SendOverdueNotificationEmailsUseCase(inbox as unknown as NotificationInbox, sender, new FixedClock(NOW), silentLogger);

    expect((await useCase.execute()).unwrap()).toEqual({ sent: 0, failed: 1 });
    expect(inbox.releaseEmailClaim).toHaveBeenCalledWith('n1');
  });
});
