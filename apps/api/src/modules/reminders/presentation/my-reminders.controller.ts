import { Controller, Get, Inject } from '@nestjs/common';
import { CLOCK, type Clock } from '@kora/core';
import type { LeaderReminders } from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { chileDate } from '../application/chile-calendar';
import { GetLeaderRemindersUseCase } from '../application/use-cases/get-leader-reminders.use-case';

/** Pendientes en vivo para la campanita — cada usuario ve solo los suyos, sin permisos extra (como `/notifications`). */
@Controller('reminders')
export class MyRemindersController {
  constructor(
    private readonly leaderReminders: GetLeaderRemindersUseCase,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get('me')
  async mine(@CurrentUser() actor: RequestUser): Promise<LeaderReminders> {
    return unwrapOrThrow(
      await this.leaderReminders.execute({
        userId: actor.id,
        role: actor.role,
        permissions: actor.permissions,
        today: chileDate(this.clock.now()),
      }),
    );
  }
}
