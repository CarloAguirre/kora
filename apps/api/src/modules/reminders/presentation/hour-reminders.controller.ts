import { Controller, Inject, Post, Query } from '@nestjs/common';
import { CLOCK, type Clock } from '@kora/core';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { chileDate } from '../application/chile-calendar';
import {
  SendMissingHoursRemindersUseCase,
  type SendMissingHoursRemindersResult,
} from '../application/use-cases/send-missing-hours-reminders.use-case';
import {
  SendPendingHoursDigestUseCase,
  type SendPendingHoursDigestResult,
} from '../application/use-cases/send-pending-hours-digest.use-case';
import {
  SendSupportBillingDigestUseCase,
  type SendSupportBillingDigestResult,
} from '../application/use-cases/send-support-billing-digest.use-case';

/**
 * Ejecución manual de los recordatorios de horas — el equivalente al
 * "Run workflow" que tenían en GitHub Actions en la v1.
 *
 * `dryRun` es `true` por defecto (igual que el importador legacy): sin
 * `?dryRun=false` solo devuelve a quién se le escribiría. `onlyEmail` limita
 * la ejecución a una persona. No toca el candado diario de la tarea programada.
 */
@Controller('admin/hour-reminders')
export class HourRemindersController {
  constructor(
    private readonly missingHours: SendMissingHoursRemindersUseCase,
    private readonly pendingDigest: SendPendingHoursDigestUseCase,
    private readonly supportBillingDigest: SendSupportBillingDigestUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Post('missing-hours')
  @RequirePermissions('hours:read_all')
  async runMissingHours(
    @Query('dryRun') dryRun?: string,
    @Query('onlyEmail') onlyEmail?: string,
  ): Promise<SendMissingHoursRemindersResult> {
    return unwrapOrThrow(
      await this.missingHours.execute({ today: chileDate(this.clock.now()), dryRun: dryRun !== 'false', onlyEmail }),
    );
  }

  @Post('pending-approvals')
  @RequirePermissions('hours:read_all')
  async runPendingApprovals(
    @Query('dryRun') dryRun?: string,
    @Query('onlyEmail') onlyEmail?: string,
  ): Promise<SendPendingHoursDigestResult> {
    return unwrapOrThrow(
      await this.pendingDigest.execute({ today: chileDate(this.clock.now()), dryRun: dryRun !== 'false', onlyEmail }),
    );
  }

  /** Corre aunque hoy no sea el último día hábil: las HH son las del mes en curso hasta hoy. */
  @Post('support-billing')
  @RequirePermissions('billing:manage')
  async runSupportBilling(
    @Query('dryRun') dryRun?: string,
    @Query('onlyEmail') onlyEmail?: string,
  ): Promise<SendSupportBillingDigestResult> {
    return unwrapOrThrow(
      await this.supportBillingDigest.execute({
        today: chileDate(this.clock.now()),
        dryRun: dryRun !== 'false',
        onlyOnLastBusinessDay: false,
        onlyEmail,
      }),
    );
  }
}
