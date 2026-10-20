import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { HoursModule } from '../hours/hours.module';
import { ProjectsModule } from '../projects/projects.module';
import { HOUR_REMINDER_READER } from './application/ports/hour-reminder-reader.port';
import { LED_PROJECT_READER } from './application/ports/led-project-reader.port';
import { SCHEDULED_JOB_RUN_REGISTRY } from './application/ports/scheduled-job-run-registry.port';
import { GetLeaderRemindersUseCase } from './application/use-cases/get-leader-reminders.use-case';
import { SendMissingHoursRemindersUseCase } from './application/use-cases/send-missing-hours-reminders.use-case';
import { SendPendingHoursDigestUseCase } from './application/use-cases/send-pending-hours-digest.use-case';
import { DrizzleHourReminderReader } from './infrastructure/drizzle-hour-reminder.reader';
import { DrizzleLedProjectReader } from './infrastructure/drizzle-led-project.reader';
import { DrizzleScheduledJobRunRegistry } from './infrastructure/drizzle-scheduled-job-run.registry';
import { HourRemindersScheduler } from './infrastructure/hour-reminders.scheduler';
import { HourRemindersController } from './presentation/hour-reminders.controller';
import { MyRemindersController } from './presentation/my-reminders.controller';

/**
 * Recordatorios de horas por correo, migrados desde los workflows de GitHub
 * Actions de la v1 (`notify-missing-hh-collaborators`, `notify-pending-hh-leaders`):
 * - 18:00 (lun-vie): a quien le faltan horas por registrar en los últimos 30 días.
 * - 08:00 (lun-vie): a cada aprobador, las horas que esperan su decisión.
 *
 * Y los mismos recordatorios en vivo para la campanita del líder
 * (`GET /reminders/me`), más los datos de proyecto que tiene por completar.
 * Importa `HoursModule` por `HOUR_ENTRY_REPOSITORY`; nadie importa este módulo,
 * así que no arma ciclos.
 */
@Module({
  imports: [ScheduleModule.forRoot(), ProjectsModule, HoursModule],
  controllers: [HourRemindersController, MyRemindersController],
  providers: [
    SendMissingHoursRemindersUseCase,
    SendPendingHoursDigestUseCase,
    GetLeaderRemindersUseCase,
    HourRemindersScheduler,
    { provide: HOUR_REMINDER_READER, useClass: DrizzleHourReminderReader },
    { provide: LED_PROJECT_READER, useClass: DrizzleLedProjectReader },
    { provide: SCHEDULED_JOB_RUN_REGISTRY, useClass: DrizzleScheduledJobRunRegistry },
  ],
})
export class RemindersModule {}
