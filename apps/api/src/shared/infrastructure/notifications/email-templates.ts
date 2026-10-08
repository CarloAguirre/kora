import type {
  AccountStatusNotification,
  PasswordResetNotification,
  ProjectAutoActivatedNotification,
  ProjectInvoiceBlockedNotification,
  ProjectPaymentMilestoneReadyNotification,
  ProjectReactivatedFromHoldNotification,
  UserInvitation,
} from '../../application/ports/notification.port';

/**
 * Plantillas de los correos de Kora.
 *
 * Funciones puras (datos → asunto + HTML + texto) para poder probarlas sin
 * proveedor. El layout replica el de los correos de Kora v1 —franja lima, logo,
 * saludo, botón azul marino, pie gris— para que el usuario no note el cambio de
 * plataforma. HTML en tablas y estilos en línea: es lo único que respetan
 * Outlook y Gmail por igual.
 */

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

const FONT = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const NAVY = '#122235';
const MUTED = '#64748b';
const BORDER = '#e5e7eb';

/** Todo dato de usuario (nombres, motivos, nombres de proyecto) pasa por aquí antes de entrar al HTML. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    dateStyle: 'long',
    timeStyle: 'short',
  });
}

interface LayoutInput {
  readonly webAppUrl: string;
  readonly subject: string;
  readonly firstName: string;
  /** Párrafos ya escapados (o un bloque `<table>` ya armado, que se inserta sin envolver). */
  readonly paragraphs: readonly string[];
  readonly action?: { readonly label: string; readonly url: string };
  readonly footer: string;
}

function layout(input: LayoutInput): string {
  // Un bloque `<table>` (p.ej. `detailTable`) va tal cual: una tabla dentro de `<p>` es HTML inválido.
  const paragraphs = input.paragraphs
    .map((p) =>
      p.startsWith('<table') ? p : `<p style="margin:0 0 12px; font-size:15px; line-height:22px; color:${MUTED};">${p}</p>`,
    )
    .join('\n              ');

  const action = input.action
    ? `<tr>
            <td class="kora-px" style="padding:12px 40px 4px;">
              <a href="${escapeHtml(input.action.url)}" style="display:inline-block; background-color:${NAVY}; color:#ffffff; text-decoration:none; font-family:${FONT}; font-size:15px; font-weight:600; padding:12px 24px; border-radius:8px;">
                ${escapeHtml(input.action.label)}
              </a>
            </td>
          </tr>`
    : '';

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.subject)}</title>
<style>
  @media (max-width: 600px) {
    .kora-container { width: 100% !important; }
    .kora-px { padding-left: 24px !important; padding-right: 24px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background-color:#f1f3f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f3f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" class="kora-container" width="600" cellpadding="0" cellspacing="0" style="width:600px; max-width:600px; background-color:#ffffff; border-radius:12px; border:1px solid ${BORDER};">
          <tr>
            <td style="padding:0; border-radius:12px 12px 0 0; background-color:#bbfd53; line-height:4px; font-size:4px;">&nbsp;</td>
          </tr>
          <tr>
            <td class="kora-px" style="padding:32px 40px 20px;">
              <img src="${escapeHtml(input.webAppUrl)}/images/kora-logo-pdf.png" width="120" height="61" alt="Kora" style="display:block; border:0; outline:none;">
            </td>
          </tr>
          <tr>
            <td class="kora-px" style="padding:4px 40px 0; font-family:${FONT};">
              <p style="margin:0 0 6px; font-size:20px; line-height:28px; font-weight:700; color:${NAVY};">Hola ${escapeHtml(input.firstName)},</p>
              ${paragraphs}
            </td>
          </tr>
          ${action}
          <tr>
            <td class="kora-px" style="padding:20px 40px 32px; font-family:${FONT}; font-size:12px; line-height:18px; color:#94a3b8;">
              <hr style="border:none; border-top:1px solid ${BORDER}; margin:0 0 16px;">
              ${escapeHtml(input.footer)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Versión texto plano: la usan clientes sin HTML y mejora la entregabilidad. */
function plainText(firstName: string, lines: readonly string[], footer: string): string {
  return [`Hola ${firstName},`, '', ...lines, '', '—', footer].join('\n');
}

function setPasswordUrl(webAppUrl: string, token: string): string {
  return `${webAppUrl}/definir-contrasena?token=${encodeURIComponent(token)}`;
}

function projectUrl(webAppUrl: string, projectId: string): string {
  return `${webAppUrl}/proyectos/${encodeURIComponent(projectId)}`;
}

const AUTOMATIC_FOOTER = 'Este es un correo automático de Kora. No respondas a este mensaje.';

export function renderUserInvitation(input: UserInvitation, webAppUrl: string): RenderedEmail {
  const subject = 'Kora: te dieron acceso a la plataforma';
  const url = setPasswordUrl(webAppUrl, input.setPasswordToken);
  const expires = formatDateTime(input.expiresAt);
  const footer = 'Si no esperabas esta invitación, puedes ignorar este mensaje.';

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.firstName,
      paragraphs: [
        `${escapeHtml(input.invitedByName)} te dio acceso a Kora. Para entrar, define tu contraseña.`,
        `El enlace vence el ${escapeHtml(expires)} (hora de Chile).`,
      ],
      action: { label: 'Definir mi contraseña', url },
      footer,
    }),
    text: plainText(
      input.firstName,
      [
        `${input.invitedByName} te dio acceso a Kora. Para entrar, define tu contraseña:`,
        url,
        '',
        `El enlace vence el ${expires} (hora de Chile).`,
      ],
      footer,
    ),
  };
}

export function renderPasswordReset(input: PasswordResetNotification, webAppUrl: string): RenderedEmail {
  const subject = 'Kora: restablece tu contraseña';
  const url = setPasswordUrl(webAppUrl, input.resetToken);
  const expires = formatDateTime(input.expiresAt);
  const footer = 'Si no pediste este cambio, ignora este mensaje: tu contraseña actual sigue funcionando.';

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.firstName,
      paragraphs: [
        'Recibimos una solicitud para restablecer tu contraseña de Kora.',
        `El enlace vence el ${escapeHtml(expires)} y solo puede usarse una vez.`,
      ],
      action: { label: 'Restablecer contraseña', url },
      footer,
    }),
    text: plainText(
      input.firstName,
      [
        'Recibimos una solicitud para restablecer tu contraseña de Kora:',
        url,
        '',
        `El enlace vence el ${expires} y solo puede usarse una vez.`,
      ],
      footer,
    ),
  };
}

const STATUS_COPY: Record<AccountStatusNotification['status'], { subject: string; body: string }> = {
  active: {
    subject: 'Kora: tu cuenta está activa',
    body: 'Tu cuenta de Kora fue reactivada. Ya puedes iniciar sesión.',
  },
  disabled: {
    subject: 'Kora: tu cuenta fue deshabilitada',
    body: 'Tu cuenta de Kora fue deshabilitada y ya no puedes iniciar sesión.',
  },
  blocked: {
    subject: 'Kora: tu cuenta fue bloqueada',
    body: 'Tu cuenta de Kora fue bloqueada y ya no puedes iniciar sesión.',
  },
};

export function renderAccountStatusChanged(
  input: AccountStatusNotification,
  webAppUrl: string,
): RenderedEmail {
  const copy = STATUS_COPY[input.status];
  const reason = input.reason?.trim();
  const footer = 'Si crees que es un error, contacta a un administrador de Kora.';

  return {
    subject: copy.subject,
    html: layout({
      webAppUrl,
      subject: copy.subject,
      firstName: input.firstName,
      paragraphs: [copy.body, ...(reason ? [`Motivo: ${escapeHtml(reason)}`] : [])],
      ...(input.status === 'active'
        ? { action: { label: 'Ir a Kora', url: `${webAppUrl}/login` } }
        : {}),
      footer,
    }),
    text: plainText(
      input.firstName,
      [copy.body, ...(reason ? [`Motivo: ${reason}`] : [])],
      footer,
    ),
  };
}

type ProjectAlert =
  | ProjectInvoiceBlockedNotification
  | ProjectAutoActivatedNotification
  | ProjectReactivatedFromHoldNotification;

function renderProjectAlert(
  input: ProjectAlert,
  webAppUrl: string,
  subject: string,
  body: (projectName: string) => string,
): RenderedEmail {
  const url = projectUrl(webAppUrl, input.projectId);

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.recipientFirstName,
      paragraphs: [body(`<strong style="color:${NAVY};">${escapeHtml(input.projectName)}</strong>`)],
      action: { label: 'Ver proyecto', url },
      footer: AUTOMATIC_FOOTER,
    }),
    text: plainText(input.recipientFirstName, [body(input.projectName), '', url], AUTOMATIC_FOOTER),
  };
}

export function renderProjectInvoiceBlocked(
  input: ProjectInvoiceBlockedNotification,
  webAppUrl: string,
): RenderedEmail {
  return renderProjectAlert(
    input,
    webAppUrl,
    `Kora: factura bloqueada en ${input.projectName}`,
    (name) =>
      `Se intentó facturar un hito del proyecto ${name}, pero el proyecto aún no está Aprobado. La factura no se emitió.`,
  );
}

export function renderProjectAutoActivated(
  input: ProjectAutoActivatedNotification,
  webAppUrl: string,
): RenderedEmail {
  return renderProjectAlert(
    input,
    webAppUrl,
    `Kora: ${input.projectName} pasó a Activo`,
    (name) =>
      `Se facturó el primer tramo (Hito 0) del proyecto ${name}, por lo que pasó automáticamente a Activo.`,
  );
}

/** Mismo formato que `formatMoney` del front: UF con 2 decimales, CLP/USD con separador de miles chileno. */
function formatMoney(value: number, currency: ProjectPaymentMilestoneReadyNotification['currency']): string {
  if (currency === 'UF') return `${value.toFixed(2)} UF`;
  return `${value.toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${currency}`;
}

/** Filas "etiqueta: valor" del detalle del tramo — tabla, no `<dl>`: Outlook no la respeta. */
function detailTable(rows: ReadonlyArray<readonly [string, string]>): string {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 12px; font-size:13px; color:${MUTED}; border-bottom:1px solid ${BORDER}; width:40%;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 12px; font-size:14px; font-weight:600; color:${NAVY}; border-bottom:1px solid ${BORDER};">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px; border:1px solid ${BORDER}; border-radius:8px; border-collapse:separate; font-family:${FONT};">${cells}</table>`;
}

export function renderProjectPaymentMilestoneReady(
  input: ProjectPaymentMilestoneReadyNotification,
  webAppUrl: string,
): RenderedEmail {
  const subject = `Kora: tramo "${input.milestoneName}" por facturar en ${input.projectName}`;
  const url = `${webAppUrl}/facturacion`;
  const amount = formatMoney(input.amount, input.currency);
  const rows: Array<readonly [string, string]> = [
    ['Proyecto', input.projectName],
    ...(input.clientName ? [['Cliente', input.clientName] as const] : []),
    ['Tramo', input.percent !== null ? `${input.milestoneName} (${input.percent.toLocaleString('es-CL')}%)` : input.milestoneName],
    ['Monto', amount],
  ];
  const intro = (name: string, milestone: string, reason: string, status: string) =>
    `El proyecto ${name} cumplió el hito del tramo ${milestone}: ${reason}. El tramo quedó en estado ${status}.`;

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.recipientFirstName,
      paragraphs: [
        intro(
          `<strong style="color:${NAVY};">${escapeHtml(input.projectName)}</strong>`,
          `<strong style="color:${NAVY};">${escapeHtml(input.milestoneName)}</strong>`,
          escapeHtml(input.reason),
          `<strong style="color:${NAVY};">Por facturar</strong>`,
        ),
        detailTable(rows),
        'Emite la factura y regístrala en Kora (folio y fecha de emisión) para dejar el tramo como Facturado.',
      ],
      action: { label: 'Ir a Facturación', url },
      footer: AUTOMATIC_FOOTER,
    }),
    text: plainText(
      input.recipientFirstName,
      [
        intro(input.projectName, input.milestoneName, input.reason, 'Por facturar'),
        '',
        ...rows.map(([label, value]) => `${label}: ${value}`),
        '',
        'Emite la factura y regístrala en Kora (folio y fecha de emisión) para dejar el tramo como Facturado:',
        url,
      ],
      AUTOMATIC_FOOTER,
    ),
  };
}

export function renderProjectReactivatedFromHold(
  input: ProjectReactivatedFromHoldNotification,
  webAppUrl: string,
): RenderedEmail {
  return renderProjectAlert(
    input,
    webAppUrl,
    `Kora: ${input.projectName} se reactivó`,
    (name) =>
      `El proyecto ${name} estaba Detenido y se reactivó a Activo al facturar el primer tramo (Hito 0). Confirma que el cambio es correcto.`,
  );
}
