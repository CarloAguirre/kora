import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CLOCK, LOGGER, type Clock, type Logger } from '@kora/core';
import { AppConfigService } from '../../../config/app-config.service';
import { chileDate } from '../application/chile-calendar';
import {
  SCHEDULED_JOB_RUN_REGISTRY,
  type ScheduledJobRunRegistry,
} from '../application/ports/scheduled-job-run-registry.port';
import { SendMissingHoursRemindersUseCase } from '../application/use-cases/send-missing-hours-reminders.use-case';
import { SendPendingHoursDigestUseCase } from '../application/use-cases/send-pending-hours-digest.use-case';

const CHILE_TIMEZONE = 'America/Santiago';

/**
 * Disparadores de los recordatorios de horas, dentro de la propia API.
 *
 * En la v1 eran dos workflows de GitHub Actions con la hora en UTC fija (había
 * que corregir el cron a mano en cada cambio de horario); aquí la zona es
 * `America/Santiago`, así que siempre son las 18:00 y 08:00 locales.
 *
 * Solo corren con `HOUR_REMINDERS_ENABLED=true`. Cada tarea reclama su día en
 * `scheduled_job_runs` antes de enviar: un reinicio en el minuto exacto o una
 * segunda instancia de la API no duplican correos.
 */
@Injectable()
export class HourRemindersScheduler {
  constructor(
    private readonly config: AppConfigService,
    private readonly missingHours: SendMissingHoursRemindersUseCase,
    private readonly pendingDigest: SendPendingHoursDigestUseCase,
    @Inject(SCHEDULED_JOB_RUN_REGISTRY) private readonly runs: ScheduledJobRunRegistry,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  @Cron('0 18 * * 1-5', { name: 'missing-hours-reminders', timeZone: CHILE_TIMEZONE })
  sendMissingHoursReminders(): Promise<void> {
    return this.runOncePerDay('missing_hours_reminders', async (today) => {
      const result = await this.missingHours.execute({ today, dryRun: false });
      return { ...result.unwrap() };
    });
  }

  @Cron('0 8 * * 1-5', { name: 'pending-hours-digest', timeZone: CHILE_TIMEZONE })
  sendPendingHoursDigest(): Promise<void> {
    return this.runOncePerDay('pending_hours_digest', async (today) => {
      const result = await this.pendingDigest.execute({ today, dryRun: false });
      return { ...result.unwrap() };
    });
  }

  private async runOncePerDay(jobName: string, job: (today: string) => Promise<Record<string, unknown>>): Promise<void> {
    if (!this.config.hourReminders.enabled) return;

    const today = chileDate(this.clock.now());
    try {
      if (!(await this.runs.tryStart(jobName, today))) {
        this.logger.warn('[recordatorios] Tarea ya ejecutada hoy, se omite', { jobName, today });
        return;
      }
      const summary = await job(today);
      await this.runs.finish(jobName, today, summary);
      this.logger.info('[recordatorios] Tarea completada', { jobName, ...summary });
    } catch (error) {
      // Un cron que lanza solo deja una traza genérica de @nestjs/schedule: se registra aquí con contexto.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('[recordatorios] La tarea falló', { jobName, today, error: message });
      await this.runs.finish(jobName, today, { error: message }).catch(() => undefined);
    }
  }
}
