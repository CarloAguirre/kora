import { describe, expect, it } from 'vitest';
import type { Logger } from '@kora/core';
import type { MailSettings } from '../../../config/app-config.service';
import {
  NotificationDeliveryError,
  ResendNotificationSender,
  type ResendEmailsClient,
} from './resend-notification.sender';
import {
  escapeHtml,
  renderAccountStatusChanged,
  renderMissingHoursReminder,
  renderPasswordReset,
  renderPendingHoursDigest,
} from './email-templates';

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

const settings: MailSettings = {
  enabled: true,
  resendApiKey: 're_test',
  from: 'Kora <avisos@kora-correos.online>',
  redirectTo: null,
  webAppUrl: 'https://kora.kabeli.cl',
};

type SendPayload = Parameters<ResendEmailsClient['send']>[0];

function fakeClient(result: Awaited<ReturnType<ResendEmailsClient['send']>>) {
  const sent: SendPayload[] = [];
  const client = {
    send: async (payload: SendPayload) => {
      sent.push(payload);
      return result;
    },
  } as ResendEmailsClient;
  return { client, sent };
}

const okResult = { data: { id: 'email_1' }, error: null, headers: null } as Awaited<
  ReturnType<ResendEmailsClient['send']>
>;

const invitation = {
  email: 'ana@kabeli.cl',
  firstName: 'Ana',
  invitedByName: 'admin@kabeli.cl',
  setPasswordToken: 'tok/en+1',
  expiresAt: new Date('2026-10-10T15:00:00.000Z'),
};

describe('ResendNotificationSender', () => {
  it('envía la invitación desde el remitente configurado con un enlace absoluto a /definir-contrasena', async () => {
    const { client, sent } = fakeClient(okResult);
    await new ResendNotificationSender(client, settings, silentLogger).sendUserInvitation(invitation);

    expect(sent).toHaveLength(1);
    const payload = sent[0]!;
    expect(payload.from).toBe('Kora <avisos@kora-correos.online>');
    expect(payload.to).toBe('ana@kabeli.cl');
    expect(payload.text).toContain('https://kora.kabeli.cl/definir-contrasena?token=tok%2Fen%2B1');
    expect(payload.html).toContain('https://kora.kabeli.cl/definir-contrasena?token=tok%2Fen%2B1');
    expect(payload.tags).toContainEqual({ name: 'app', value: 'kora2' });
  });

  it('lanza cuando Resend devuelve error, para que el caso de uso sepa que no se envió', async () => {
    const { client } = fakeClient({
      data: null,
      error: { message: 'API key is invalid', name: 'validation_error' },
      headers: null,
    } as Awaited<ReturnType<ResendEmailsClient['send']>>);

    await expect(
      new ResendNotificationSender(client, settings, silentLogger).sendUserInvitation(invitation),
    ).rejects.toBeInstanceOf(NotificationDeliveryError);
  });

  it('con MAIL_REDIRECT_TO desvía el correo y deja el destinatario original en el asunto', async () => {
    const { client, sent } = fakeClient(okResult);
    await new ResendNotificationSender(
      client,
      { ...settings, redirectTo: 'dev@kabeli.cl' },
      silentLogger,
    ).sendUserInvitation(invitation);

    expect(sent[0]!.to).toBe('dev@kabeli.cl');
    expect(sent[0]!.subject).toMatch(/^\[para ana@kabeli\.cl\] /);
  });

  it('envía las alertas de proyecto al destinatario con enlace a la ficha', async () => {
    const { client, sent } = fakeClient(okResult);
    await new ResendNotificationSender(client, settings, silentLogger).sendProjectAutoActivated({
      recipientEmail: 'pmo@kabeli.cl',
      recipientFirstName: 'Pía',
      projectId: 'p-1',
      projectName: 'Portal <Clientes>',
    });

    expect(sent[0]!.to).toBe('pmo@kabeli.cl');
    expect(sent[0]!.html).toContain('https://kora.kabeli.cl/proyectos/p-1');
    expect(sent[0]!.html).toContain('Portal &lt;Clientes&gt;');
    expect(sent[0]!.html).not.toContain('Portal <Clientes>');
  });
});

describe('plantillas de correo', () => {
  it('escapa HTML en los datos de usuario', () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );

    const email = renderAccountStatusChanged(
      { email: 'a@kabeli.cl', firstName: '<b>Ana</b>', status: 'blocked', reason: '<img src=x>' },
      settings.webAppUrl,
    );
    expect(email.html).not.toContain('<b>Ana</b>');
    expect(email.html).not.toContain('<img src=x>');
    expect(email.html).toContain('Motivo: &lt;img src=x&gt;');
  });

  it('la recuperación usa la misma pantalla que la invitación', () => {
    const email = renderPasswordReset(
      { email: 'a@kabeli.cl', firstName: 'Ana', resetToken: 'abc', expiresAt: new Date() },
      settings.webAppUrl,
    );
    expect(email.text).toContain('https://kora.kabeli.cl/definir-contrasena?token=abc');
  });
});

describe('plantillas de recordatorios de horas', () => {
  it('el recordatorio de horas lista los días con su detalle y enlaza a /horas', () => {
    const email = renderMissingHoursReminder(
      {
        recipientEmail: 'ana@kabeli.cl',
        recipientFirstName: 'Ana',
        expectedHoursPerDay: 8,
        days: [
          { date: '2026-10-14', hoursRegistered: 4 },
          { date: '2026-10-13', hoursRegistered: 0 },
        ],
      },
      'https://kora.kabeli.cl',
    );

    expect(email.subject).toBe('Kora: te faltan 2 días por registrar horas');
    expect(email.text).toContain('Martes 13/10 (sin registrar)');
    expect(email.text).toContain('Miércoles 14/10 (4h de 8h)');
    expect(email.text.indexOf('13/10')).toBeLessThan(email.text.indexOf('14/10'));
    expect(email.html).toContain('href="https://kora.kabeli.cl/horas"');
  });

  it('el resumen del aprobador separa por tipo, escapa nombres y enlaza a /horas/aprobaciones', () => {
    const email = renderPendingHoursDigest(
      {
        recipientEmail: 'luis@kabeli.cl',
        recipientFirstName: 'Luis',
        items: [
          { kind: 'project', ownerFullName: 'Ana <b>', label: 'App Walvy', date: '2026-10-14', hours: 4, daysPending: 2 },
          { kind: 'ticket', ownerFullName: 'Beto', label: 'TK-1200 · Soporte', date: '2026-10-15', hours: 1.5, daysPending: 1 },
        ],
      },
      'https://kora.kabeli.cl',
    );

    expect(email.subject).toBe('Kora: tienes 2 solicitudes de horas por aprobar');
    expect(email.text).toContain('(5,5h en total)');
    expect(email.text).toContain('Horas de proyecto:');
    expect(email.text).toContain('Horas de soporte (tickets):');
    expect(email.text).not.toContain('Horas sin proyecto');
    expect(email.html).toContain('Ana &lt;b&gt;');
    expect(email.html).toContain('href="https://kora.kabeli.cl/horas/aprobaciones"');
  });
});
