import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import type { ListNotificationsResponse } from '@kora/contracts';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { ListNotificationsUseCase } from '../application/use-cases/list-notifications.use-case';
import { MarkNotificationsReadUseCase } from '../application/use-cases/mark-notifications-read.use-case';

/** Campanita: cada usuario autenticado ve y marca solo las suyas — no requiere permisos extra. */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly listNotifications: ListNotificationsUseCase,
    private readonly markRead: MarkNotificationsReadUseCase,
  ) {}

  @Get()
  async list(@CurrentUser() actor: RequestUser): Promise<ListNotificationsResponse> {
    return unwrapOrThrow(await this.listNotifications.execute({ userId: actor.id }));
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async readAll(@CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.markRead.execute({ userId: actor.id }));
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async read(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.markRead.execute({ userId: actor.id, notificationId: id }));
  }
}
