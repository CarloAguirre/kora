import { Inject, Injectable } from '@nestjs/common';
import { LOGGER, ok, type Logger, type Result } from '@kora/core';
import { SUPPORT_PLAN_TYPE_LABELS } from '@kora/contracts';
import {
  NOTIFICATION_SENDER,
  type NotificationSender,
  type SupportBillingDigestItem,
} from '../../../../shared/application/ports/notification.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../../../tickets/application/ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../../../tickets/application/ports/ticket-project-reader.port';
import { resolveSupportPlanHourProjectIds } from '../../../tickets/application/services/support-plan-linked-projects';
import { resolveSupportPlanName } from '../../../tickets/application/services/support-plan-naming';
import {
  SUPPORT_PLAN_REPOSITORY,
  type SupportPlanRecord,
  type SupportPlanRepository,
} from '../../../tickets/domain/repositories/support-plan.repository';
import { addDays, weekdaysBetween } from '../chile-calendar';
import { HOUR_REMINDER_READER, type HourReminderReader } from '../ports/hour-reminder-reader.port';

export interface SendSupportBillingDigestCommand {
  /** "Hoy" en Chile (`YYYY-MM-DD`): el mes que termina es el de esta fecha. */
  readonly today: string;
  readonly dryRun: boolean;
  /**
   * La tarea programada corre a diario a fin de mes y solo envía el último día
   * hábil; la ejecución manual lo apaga para poder probar cualquier día.
   */
  readonly onlyOnLastBusinessDay: boolean;
  /** Procesa solo a este destinatario (por correo). */
  readonly onlyEmail?: string | undefined;
}

export interface SendSupportBillingDigestResult {
  readonly today: string;
  /** `YYYY-MM`. */
  readonly month: string;
  readonly dryRun: boolean;
  readonly skippedNotLastBusinessDay: boolean;
  readonly plans: number;
  readonly recipients: number;
  readonly sent: number;
  readonly failed: number;
  readonly preview?: readonly SupportBillingDigestItem[];
}

const MONTH_LABEL = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/**
 * Resumen de fin de mes a admin/PMO con los contratos de soporte activos que
 * hay que cobrar: cliente, tipo de contrato y HH usadas en el mes.
 *
 * Sale el último día hábil (lun-vie sin feriados) y no el 1° del mes
 * siguiente: el panel de Facturación solo calcula en vivo el período en curso
 * (ver `SupportBillingRowBuilder`), así que el aviso tiene que llegar mientras
 * el mes que se cobra sigue abierto.
 *
 * Las HH son las aprobadas del mes en los proyectos cuyas horas consume el
 * contrato (`resolveSupportPlanHourProjectIds`, el mismo criterio que el cobro)
 * desde el inicio del contrato si empezó a mitad de mes. Las pendientes se
 * informan aparte: todavía no se cobran.
 */
@Injectable()
export class SendSupportBillingDigestUseCase
  implements UseCase<SendSupportBillingDigestCommand, SendSupportBillingDigestResult, never>
{
  constructor(
    @Inject(HOUR_REMINDER_READER) private readonly reader: HourReminderReader,
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async execute(command: SendSupportBillingDigestCommand): Promise<Result<SendSupportBillingDigestResult, never>> {
    const { today, dryRun } = command;
    const month = today.slice(0, 7);
    const monthStart = `${month}-01`;
    const monthEnd = lastDayOfMonth(today);
    const base = { today, month, dryRun, plans: 0, recipients: 0, sent: 0, failed: 0 };

    if (command.onlyOnLastBusinessDay && !(await this.isLastBusinessDay(today, monthEnd))) {
      return ok({ ...base, skippedNotLastBusinessDay: true });
    }

    const records = (await this.plans.listAllActive()).filter((plan) => toIsoDate(plan.startDate) <= monthEnd);
    const clientNames = await this.clients.findCompanyNames(records.map((plan) => plan.clientId));
    const items: SupportBillingDigestItem[] = [];
    for (const plan of records) {
      items.push(await this.toItem(plan, clientNames.get(plan.clientId) ?? '', monthStart, monthEnd));
    }
    items.sort((a, b) => a.clientName.localeCompare(b.clientName, 'es') || a.planName.localeCompare(b.planName, 'es'));

    const onlyEmail = command.onlyEmail?.trim().toLowerCase();
    const recipients = (await this.reader.findActiveAdminTierUsers()).filter(
      (recipient) => !onlyEmail || recipient.email.toLowerCase() === onlyEmail,
    );
    const counts = { ...base, plans: items.length, recipients: recipients.length };

    if (dryRun) return ok({ ...counts, skippedNotLastBusinessDay: false, preview: items });

    const monthLabel = MONTH_LABEL.format(new Date(`${monthStart}T00:00:00Z`));
    let sent = 0;
    let failed = 0;
    for (const recipient of recipients) {
      try {
        await this.notifications.sendSupportBillingDigest({
          recipientEmail: recipient.email,
          recipientFirstName: recipient.firstName,
          monthLabel,
          items,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        this.logger.error('[recordatorios] No se pudo enviar el resumen de soportes por cobrar', {
          userId: recipient.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return ok({ ...counts, skippedNotLastBusinessDay: false, sent, failed });
  }

  /** Hoy es hábil y no queda otro día hábil hasta fin de mes. */
  private async isLastBusinessDay(today: string, monthEnd: string): Promise<boolean> {
    const holidays = new Set(await this.reader.findHolidays(today, monthEnd));
    const businessDays = weekdaysBetween(today, monthEnd).filter((day) => !holidays.has(day));
    return businessDays.length === 1 && businessDays[0] === today;
  }

  private async toItem(
    plan: SupportPlanRecord,
    clientName: string,
    monthStart: string,
    monthEnd: string,
  ): Promise<SupportBillingDigestItem> {
    const projectIds = await resolveSupportPlanHourProjectIds(this.plans, plan);
    const planStart = toIsoDate(plan.startDate);
    const dateFrom = new Date(`${planStart > monthStart ? planStart : monthStart}T00:00:00Z`);
    const dateTo = new Date(`${monthEnd}T00:00:00Z`);

    const [usedHours, pending] =
      projectIds.length === 0
        ? [0, { hours: 0 }]
        : await Promise.all([
            this.hourEntries.sumApprovedHoursForProjects(projectIds, dateFrom, dateTo),
            this.hourEntries.summarize({ projectIds, status: 'pending', dateFrom, dateTo }),
          ]);

    // Contratos legados sin `name`: mismo resorte que el panel de Facturación.
    const linkedProjects = plan.name ? [] : await this.projects.findManyByIds(projectIds);
    return {
      clientName,
      planName: resolveSupportPlanName(plan.name, plan.scope, linkedProjects.map((project) => project.name), clientName),
      contractType: contractTypeLabel(plan),
      usedHours: round2(usedHours),
      pendingHours: round2(pending.hours),
    };
  }
}

function contractTypeLabel(plan: SupportPlanRecord): string {
  const type = SUPPORT_PLAN_TYPE_LABELS[plan.planType];
  if (plan.planType !== 'monthly' || !plan.surplusPolicy) return type;
  return `${type} · ${plan.surplusPolicy === 'accumulate' ? 'acumulado' : 'con vencimiento'}`;
}

/** `2026-10-23` → `2026-10-31`. */
function lastDayOfMonth(isoDate: string): string {
  const [year, month] = isoDate.split('-').map(Number) as [number, number];
  return addDays(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`, -1);
}

/** Las columnas `date` llegan como `Date` a medianoche UTC. */
function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
