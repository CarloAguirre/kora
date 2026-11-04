import type {
  AccountStatusNotification,
  MissingHoursReminderNotification,
  PasswordResetNotification,
  PendingHoursDigestItem,
  PendingHoursDigestNotification,
  ProjectAutoActivatedNotification,
  ProjectInvoiceBlockedNotification,
  ProjectPaymentMilestoneReadyNotification,
  ProjectReactivatedFromHoldNotification,
  SupportBillingDigestItem,
  SupportBillingDigestNotification,
  TeamReportDataRequestEmail,
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

// ─────────────────────────── Recordatorios de horas ───────────────────────────

/** Cuántos días se listan en el recordatorio: los más recientes; el resto se resume en una línea. */
const MAX_MISSING_DAYS_SHOWN = 20;
/** Cuántas solicitudes se listan en el resumen del aprobador; el resto se resume en una línea. */
const MAX_DIGEST_ITEMS_SHOWN = 60;

const WEEKDAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** `2026-10-13` → `Lunes 13/10`. La fecha ya es local (Chile): se lee en UTC para no correrla un día. */
function formatWeekdayDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number) as [number, number, number];
  const weekday = WEEKDAYS_ES[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday} ${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

/** `2026-10-13` → `13/10/2026`. */
function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

function formatHours(hours: number): string {
  return `${hours.toLocaleString('es-CL', { maximumFractionDigits: 2 })}h`;
}

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}

/** Filas "dato | valor a la derecha" — misma tabla que `detailTable`, con la segunda columna alineada a la derecha. */
function listTable(rows: ReadonlyArray<{ readonly main: string; readonly sub?: string; readonly value: string }>): string {
  const cells = rows
    .map(
      (row) =>
        `<tr><td style="padding:10px 12px; border-bottom:1px solid ${BORDER}; vertical-align:top;">` +
        `<div style="font-size:14px; font-weight:600; color:${NAVY};">${row.main}</div>` +
        (row.sub ? `<div style="margin-top:2px; font-size:13px; color:${MUTED};">${row.sub}</div>` : '') +
        `</td><td style="padding:10px 12px; border-bottom:1px solid ${BORDER}; font-size:13px; font-weight:600; color:${NAVY}; text-align:right; white-space:nowrap; vertical-align:top;">${row.value}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 16px; border:1px solid ${BORDER}; border-radius:8px; border-collapse:separate; font-family:${FONT};">${cells}</table>`;
}

export function renderMissingHoursReminder(input: MissingHoursReminderNotification, webAppUrl: string): RenderedEmail {
  const total = input.days.length;
  const newestFirst = [...input.days].sort((a, b) => b.date.localeCompare(a.date));
  const shown = newestFirst.slice(0, MAX_MISSING_DAYS_SHOWN).reverse();
  const hidden = total - shown.length;

  const subject = `Kora: te faltan ${total} ${plural(total, 'día', 'días')} por registrar horas`;
  const url = `${webAppUrl}/horas`;
  const footer = 'Este es un correo automático de Kora. Si ya registraste estas horas, puedes ignorar este mensaje.';
  const intro = `No completaste tus ${input.expectedHoursPerDay} horas registradas para ${plural(total, 'el siguiente día', 'los siguientes días')}:`;
  const describe = (hours: number) =>
    hours > 0 ? `${formatHours(hours)} de ${formatHours(input.expectedHoursPerDay)}` : 'sin registrar';
  const olderNote =
    hidden > 0
      ? `Y ${hidden} ${plural(hidden, 'día más antiguo', 'días más antiguos')} también sin completar — revisa tu historial en Kora.`
      : null;

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.recipientFirstName,
      paragraphs: [
        escapeHtml(intro),
        listTable(shown.map((day) => ({ main: escapeHtml(formatWeekdayDate(day.date)), value: escapeHtml(describe(day.hoursRegistered)) }))),
        ...(olderNote ? [escapeHtml(olderNote)] : []),
      ],
      action: { label: 'Registrar horas', url },
      footer,
    }),
    text: plainText(
      input.recipientFirstName,
      [
        intro,
        '',
        ...shown.map((day) => `  - ${formatWeekdayDate(day.date)} (${describe(day.hoursRegistered)})`),
        ...(olderNote ? ['', olderNote] : []),
        '',
        `Registrar horas: ${url}`,
      ],
      footer,
    ),
  };
}

const DIGEST_SECTIONS: ReadonlyArray<{ readonly kind: PendingHoursDigestItem['kind']; readonly title: string }> = [
  { kind: 'project', title: 'Horas de proyecto' },
  { kind: 'no_project', title: 'Horas sin proyecto' },
  { kind: 'ticket', title: 'Horas de soporte (tickets)' },
];

export function renderPendingHoursDigest(input: PendingHoursDigestNotification, webAppUrl: string): RenderedEmail {
  const total = input.items.length;
  const totalHours = input.items.reduce((sum, item) => sum + item.hours, 0);
  const shown = [...input.items]
    .sort((a, b) => a.date.localeCompare(b.date) || a.ownerFullName.localeCompare(b.ownerFullName))
    .slice(0, MAX_DIGEST_ITEMS_SHOWN);
  const hidden = total - shown.length;

  const subject = `Kora: tienes ${total} ${plural(total, 'solicitud de horas', 'solicitudes de horas')} por aprobar`;
  const url = `${webAppUrl}/horas/aprobaciones`;
  const footer = 'Este es un correo automático de Kora. Si ya revisaste estas horas, puedes ignorar este mensaje.';
  const intro = `Tienes ${total} ${plural(total, 'solicitud pendiente', 'solicitudes pendientes')} de aprobar en Kora (${formatHours(totalHours)} en total).`;
  const pendingFor = (item: PendingHoursDigestItem) =>
    `${item.daysPending} ${plural(item.daysPending, 'día', 'días')} pendiente`;
  const olderNote = hidden > 0 ? `Y ${hidden} ${plural(hidden, 'solicitud más', 'solicitudes más')} — revísalas en Kora.` : null;

  const htmlSections: string[] = [];
  const textSections: string[] = [];
  for (const section of DIGEST_SECTIONS) {
    const items = shown.filter((item) => item.kind === section.kind);
    if (items.length === 0) continue;
    htmlSections.push(
      `<strong style="font-size:12px; letter-spacing:0.04em; text-transform:uppercase; color:${MUTED};">${escapeHtml(section.title)}</strong>`,
      listTable(
        items.map((item) => ({
          main: escapeHtml(item.ownerFullName),
          sub: escapeHtml(`${item.label} · ${formatShortDate(item.date)} · ${pendingFor(item)}`),
          value: escapeHtml(formatHours(item.hours)),
        })),
      ),
    );
    textSections.push(
      '',
      `${section.title}:`,
      ...items.map((item) => `  - ${item.ownerFullName} · ${item.label} · ${formatHours(item.hours)} (${formatShortDate(item.date)}, ${pendingFor(item)})`),
    );
  }

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.recipientFirstName,
      paragraphs: [escapeHtml(intro), ...htmlSections, ...(olderNote ? [escapeHtml(olderNote)] : [])],
      action: { label: 'Ir a aprobar horas', url },
      footer,
    }),
    text: plainText(
      input.recipientFirstName,
      [intro, '', `Ir a aprobar horas: ${url}`, ...textSections, ...(olderNote ? ['', olderNote] : [])],
      footer,
    ),
  };
}

// ─────────────────────────── Facturación de soporte ───────────────────────────

export function renderSupportBillingDigest(input: SupportBillingDigestNotification, webAppUrl: string): RenderedEmail {
  const total = input.items.length;
  const totalHours = input.items.reduce((sum, item) => sum + item.usedHours, 0);
  const items = input.items;

  const subject = `Kora: soportes por cobrar de ${input.monthLabel}`;
  const url = `${webAppUrl}/facturacion`;
  const intro =
    total > 0
      ? `Termina ${input.monthLabel}. Estos son los ${total} ${plural(total, 'contrato de soporte activo', 'contratos de soporte activos')} por cobrar, con las HH aprobadas en el mes (${formatHours(totalHours)} en total):`
      : `Termina ${input.monthLabel} y no hay contratos de soporte activos por cobrar.`;
  const pendingNote = (item: SupportBillingDigestItem) =>
    item.pendingHours > 0 ? `${formatHours(item.pendingHours)} por aprobar` : null;
  const hasPending = items.some((item) => item.pendingHours > 0);
  const pendingFooter = hasPending
    ? 'Las HH por aprobar no se cobran hasta que se aprueben: revísalas antes de emitir la factura.'
    : null;

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.recipientFirstName,
      paragraphs: [
        escapeHtml(intro),
        ...(total > 0
          ? [
              listTable(
                items.map((item) => ({
                  main: escapeHtml(item.clientName),
                  sub: escapeHtml([item.planName, item.contractType, pendingNote(item)].filter(Boolean).join(' · ')),
                  value: escapeHtml(formatHours(item.usedHours)),
                })),
              ),
            ]
          : []),
        ...(pendingFooter ? [escapeHtml(pendingFooter)] : []),
      ],
      action: { label: 'Ir a Facturación', url },
      footer: AUTOMATIC_FOOTER,
    }),
    text: plainText(
      input.recipientFirstName,
      [
        intro,
        '',
        ...items.map((item) => {
          const pending = pendingNote(item);
          return `  - ${item.clientName} · ${item.planName} · ${item.contractType}: ${formatHours(item.usedHours)}${pending ? ` (${pending})` : ''}`;
        }),
        ...(pendingFooter ? ['', pendingFooter] : []),
        '',
        `Ir a Facturación: ${url}`,
      ],
      AUTOMATIC_FOOTER,
    ),
  };
}

// ─────────────────────────── Reporte de equipo ───────────────────────────

export function renderTeamReportDataRequest(input: TeamReportDataRequestEmail, webAppUrl: string): RenderedEmail {
  const total = input.items.length;
  const subject = `Kora: ${input.requestedByName} te pide completar datos de ${total} ${plural(total, 'proyecto', 'proyectos')}`;
  const intro = `${input.requestedByName} (líder del equipo ${input.teamName}) necesita que completes estos datos para su reporte de equipo. Te lo avisamos en Kora hace 48 horas.`;
  const footer = 'Este es un correo automático de Kora. Cuando completes el dato, la solicitud se cierra sola.';
  const label = (item: TeamReportDataRequestEmail['items'][number]) =>
    item.clientName ? `${item.clientName} — ${item.projectName}` : item.projectName;

  return {
    subject,
    html: layout({
      webAppUrl,
      subject,
      firstName: input.recipientFirstName,
      paragraphs: [
        escapeHtml(intro),
        listTable(
          input.items.map((item) => ({
            main: `<a href="${escapeHtml(projectUrl(webAppUrl, item.projectSlug))}" style="color:${NAVY};">${escapeHtml(label(item))}</a>`,
            value: escapeHtml(item.missing),
          })),
        ),
        ...(input.note ? [`<strong>Nota:</strong> ${escapeHtml(input.note)}`] : []),
      ],
      action: { label: 'Abrir Kora', url: webAppUrl },
      footer,
    }),
    text: plainText(
      input.recipientFirstName,
      [
        intro,
        '',
        ...input.items.map((item) => `  - ${label(item)}: ${item.missing} — ${projectUrl(webAppUrl, item.projectSlug)}`),
        ...(input.note ? ['', `Nota: ${input.note}`] : []),
      ],
      footer,
    ),
  };
}
