import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ProjectsModule } from '../projects/projects.module';
import { HOUR_REMINDER_READER } from './application/ports/hour-reminder-reader.port';
import { SCHEDULED_JOB_RUN_REGISTRY } from './application/ports/scheduled-job-run-registry.port';
import { SendMissingHoursRemindersUseCase } from './application/use-cases/send-missing-hours-reminders.use-case';
import { SendPendingHoursDigestUseCase } from './application/use-cases/send-pending-hours-digest.use-case';
import { DrizzleHourReminderReader } from './infrastructure/drizzle-hour-reminder.reader';
import { DrizzleScheduledJobRunRegistry } from './infrastructure/drizzle-scheduled-job-run.registry';
import { HourRemindersScheduler } from './infrastructure/hour-reminders.scheduler';
import { HourRemindersController } from './presentation/hour-reminders.controller';

/**
 * Recordatorios de horas por correo, migrados desde los workflows de GitHub
 * Actions de la v1 (`notify-missing-hh-collaborators`, `notify-pending-hh-leaders`):
 * - 18:00 (lun-vie): a quien le faltan horas por registrar en los últimos 30 días.
 * - 08:00 (lun-vie): a cada aprobador, las horas que esperan su decisión.
 */
@Module({
  imports: [ScheduleModule.forRoot(), ProjectsModule],
  controllers: [HourRemindersController],
  providers: [
    SendMissingHoursRemindersUseCase,
    SendPendingHoursDigestUseCase,
    HourRemindersScheduler,
    { provide: HOUR_REMINDER_READER, useClass: DrizzleHourReminderReader },
    { provide: SCHEDULED_JOB_RUN_REGISTRY, useClass: DrizzleScheduledJobRunRegistry },
  ],
})
export class RemindersModule {}
