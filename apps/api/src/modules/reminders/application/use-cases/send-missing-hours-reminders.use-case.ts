import { Inject, Injectable } from '@nestjs/common';
import { LOGGER, ok, type Logger, type Result } from '@kora/core';
import {
  NOTIFICATION_SENDER,
  type MissingHoursDay,
  type NotificationSender,
} from '../../../../shared/application/ports/notification.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { addDays, weekdaysBetween } from '../chile-calendar';
import { HOUR_REMINDER_READER, type HourReminderReader } from '../ports/hour-reminder-reader.port';

/** Jornada esperada por día hábil. */
export const EXPECTED_HOURS_PER_DAY = 8;
/** Cuántos días hacia atrás (contando hoy) se revisan: un hueco viejo deja de recordarse al salir de la ventana. */
export const MISSING_HOURS_LOOKBACK_DAYS = 30;

export interface SendMissingHoursRemindersCommand {
  /** "Hoy" en Chile (`YYYY-MM-DD`): último día que se revisa. */
  readonly today: string;
  /** Calcula a quién se le escribiría, sin enviar nada. */
  readonly dryRun: boolean;
  /** Procesa solo a este usuario (por correo) — para reenviar o revisar un caso puntual. */
  readonly onlyEmail?: string | undefined;
}

export interface MissingHoursRecipientPreview {
  readonly email: string;
  readonly days: readonly MissingHoursDay[];
}

export interface SendMissingHoursRemindersResult {
  readonly today: string;
  readonly dryRun: boolean;
  /** Hoy es feriado: no se revisa ni se envía nada. */
  readonly skippedHoliday: boolean;
  readonly registrants: number;
  readonly sent: number;
  readonly skippedComplete: number;
  readonly skippedNoActivity: number;
  readonly failed: number;
  /** Solo en `dryRun`: a quién se le escribiría y por qué días. */
  readonly preview?: readonly MissingHoursRecipientPreview[];
}

/**
 * Recordatorio diario de las 18:00 (reemplaza `notify-missing-hh-collaborators`
 * de la v1, que corría en GitHub Actions contra Supabase).
 *
 * A cada usuario activo que registra horas y tiene algún día hábil reciente
 * (lunes a viernes, sin feriados, en los últimos 30 días incluido hoy) con
 * menos de 8 h registradas, le envía la lista de esos días. La ventana nunca
 * empieza antes de su primer registro: quien entró hace una semana no recibe
 * días previos a su llegada. Quien nunca registró nada se omite —no hay fecha
 * de ingreso desde la cual contar—.
 *
 * Un envío fallido no corta el lote: se cuenta y se sigue con el siguiente.
 */
@Injectable()
export class SendMissingHoursRemindersUseCase
  implements UseCase<SendMissingHoursRemindersCommand, SendMissingHoursRemindersResult, never>
{
  constructor(
    @Inject(HOUR_REMINDER_READER) private readonly reader: HourReminderReader,
    @Inject(NOTIFICATION_SENDER) private readonly notifications: NotificationSender,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async execute(command: SendMissingHoursRemindersCommand): Promise<Result<SendMissingHoursRemindersResult, never>> {
    const { today, dryRun } = command;
    const windowStart = addDays(today, -(MISSING_HOURS_LOOKBACK_DAYS - 1));

    const holidays = new Set(await this.reader.findHolidays(windowStart, today));
    const base = { today, dryRun, registrants: 0, sent: 0, skippedComplete: 0, skippedNoActivity: 0, failed: 0 };
    if (holidays.has(today)) return ok({ ...base, skippedHoliday: true });

    const onlyEmail = command.onlyEmail?.trim().toLowerCase();
    const registrants = (await this.reader.findHoursRegistrants()).filter(
      (user) => !onlyEmail || user.email.toLowerCase() === onlyEmail,
    );

    const daily = await this.reader.sumDailyHours(
      registrants.map((user) => user.userId),
      windowStart,
      today,
    );
    const hoursByUserDay = new Map<string, number>();
    for (const row of daily) hoursByUserDay.set(`${row.userId}:${row.date}`, row.hours);

    const workingDays = weekdaysBetween(windowStart, today).filter((day) => !holidays.has(day));
    const preview: MissingHoursRecipientPreview[] = [];
    let sent = 0;
    let skippedComplete = 0;
    let skippedNoActivity = 0;
    let failed = 0;

    for (const user of registrants) {
      if (!user.firstEntryDate) {
        skippedNoActivity += 1;
        continue;
      }

      const days = workingDays
        .filter((day) => day >= user.firstEntryDate!)
        .map((date) => ({ date, hoursRegistered: hoursByUserDay.get(`${user.userId}:${date}`) ?? 0 }))
        .filter((day) => day.hoursRegistered < EXPECTED_HOURS_PER_DAY);

      if (days.length === 0) {
        skippedComplete += 1;
        continue;
      }

      if (dryRun) {
        preview.push({ email: user.email, days });
        continue;
      }

      try {
        await this.notifications.sendMissingHoursReminder({
          recipientEmail: user.email,
          recipientFirstName: user.firstName,
          expectedHoursPerDay: EXPECTED_HOURS_PER_DAY,
          days,
        });
        sent += 1;
      } catch (error) {
        failed += 1;
        this.logger.error('[recordatorios] No se pudo enviar el recordatorio de horas', {
          userId: user.userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return ok({
      ...base,
      skippedHoliday: false,
      registrants: registrants.length,
      sent,
      skippedComplete,
      skippedNoActivity,
      failed,
      ...(dryRun ? { preview } : {}),
    });
  }
}
