import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  createForecastAssignmentSchema,
  forecastCapacityQuerySchema,
  forecastWeeksQuerySchema,
  forecastLoadPreviewInputSchema,
  listForecastAssignmentsQuerySchema,
  listForecastHistoryQuerySchema,
  updateForecastAssignmentSchema,
  type CreateForecastAssignmentInput,
  type ForecastAssignment,
  type ForecastCapacityQuery,
  type ForecastCapacityResponse,
  type ForecastHistoryEntry,
  type ForecastRecalculateResponse,
  type ForecastLoadPreviewInput,
  type ForecastLoadPreviewResponse,
  type ForecastWeeksQuery,
  type ForecastWeeksResponse,
  type ListForecastAssignmentsQuery,
  type ListForecastHistoryQuery,
  type UpdateForecastAssignmentInput,
} from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { ActorContext } from '../../../shared/application/use-case';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { ListForecastAssignmentsUseCase } from '../application/use-cases/list-forecast-assignments.use-case';
import { CreateForecastAssignmentUseCase } from '../application/use-cases/create-forecast-assignment.use-case';
import { UpdateForecastAssignmentUseCase } from '../application/use-cases/update-forecast-assignment.use-case';
import { DeleteForecastAssignmentUseCase } from '../application/use-cases/delete-forecast-assignment.use-case';
import { GetForecastCapacityUseCase } from '../application/use-cases/get-forecast-capacity.use-case';
import { ListForecastHistoryUseCase } from '../application/use-cases/list-forecast-history.use-case';
import { ResetForecastAssignmentUseCase } from '../application/use-cases/reset-forecast-assignment.use-case';
import { KeepForecastAdjustmentUseCase } from '../application/use-cases/keep-forecast-adjustment.use-case';
import { GetForecastWeeksUseCase } from '../application/use-cases/get-forecast-weeks.use-case';
import { RecalculateForecastUseCase } from '../application/use-cases/recalculate-forecast.use-case';
import { PreviewForecastLoadUseCase } from '../application/use-cases/preview-forecast-load.use-case';

@Controller('forecast')
export class ForecastController {
  constructor(
    private readonly listAssignments: ListForecastAssignmentsUseCase,
    private readonly createAssignment: CreateForecastAssignmentUseCase,
    private readonly updateAssignment: UpdateForecastAssignmentUseCase,
    private readonly deleteAssignment: DeleteForecastAssignmentUseCase,
    private readonly getCapacity: GetForecastCapacityUseCase,
    private readonly listHistory: ListForecastHistoryUseCase,
    private readonly resetAssignment: ResetForecastAssignmentUseCase,
    private readonly keepAdjustment: KeepForecastAdjustmentUseCase,
    private readonly getWeeks: GetForecastWeeksUseCase,
    private readonly recalculate: RecalculateForecastUseCase,
    private readonly previewLoad: PreviewForecastLoadUseCase,
  ) {}

  @Get('assignments')
  @RequirePermissions('forecast:read')
  async list(
    @Query(new ZodValidationPipe(listForecastAssignmentsQuerySchema)) query: ListForecastAssignmentsQuery,
    @CurrentUser() actor: RequestUser,
  ): Promise<ForecastAssignment[]> {
    return unwrapOrThrow(
      await this.listAssignments.execute({
        teamId: query.teamId,
        periodStart: toDate(query.periodStart),
        periodEnd: toDate(query.periodEnd),
        actorUserId: actor.id,
        actorRole: actor.role,
      }),
    );
  }

  @Get('capacity')
  @RequirePermissions('forecast:read')
  async capacity(
    @Query(new ZodValidationPipe(forecastCapacityQuerySchema)) query: ForecastCapacityQuery,
  ): Promise<ForecastCapacityResponse> {
    return unwrapOrThrow(
      await this.getCapacity.execute({ periodStart: toDate(query.periodStart), periodEnd: toDate(query.periodEnd) }),
    );
  }

  @Get('weeks')
  @RequirePermissions('forecast:read')
  async weeks(@Query(new ZodValidationPipe(forecastWeeksQuerySchema)) query: ForecastWeeksQuery): Promise<ForecastWeeksResponse> {
    return unwrapOrThrow(await this.getWeeks.execute({ firstMonday: toDate(query.from), weeks: query.weeks }));
  }

  @Get('history')
  @RequirePermissions('forecast:read')
  async history(
    @Query(new ZodValidationPipe(listForecastHistoryQuerySchema)) query: ListForecastHistoryQuery,
    @CurrentUser() actor: RequestUser,
  ): Promise<ForecastHistoryEntry[]> {
    return unwrapOrThrow(
      await this.listHistory.execute({
        teamId: query.teamId,
        periodStart: query.periodStart,
        periodEnd: query.periodEnd,
        actorUserId: actor.id,
        actorRole: actor.role,
      }),
    );
  }

  @Post('assignments')
  @RequirePermissions('forecast:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createForecastAssignmentSchema)) body: CreateForecastAssignmentInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.createAssignment.execute({ data: body, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  @Patch('assignments/:id')
  @RequirePermissions('forecast:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateForecastAssignmentSchema)) body: UpdateForecastAssignmentInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateAssignment.execute({
        assignmentId: id,
        data: body,
        actor: toActorContext(actor),
        actorRole: actor.role,
      }),
    );
  }

  /** "Volver al cálculo" / "Usar el nuevo cálculo". */
  @Post('assignments/:id/reset')
  @RequirePermissions('forecast:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(
      await this.resetAssignment.execute({ assignmentId: id, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  /** "Mantener mi ajuste" sobre una fila desfasada. */
  @Post('assignments/:id/keep')
  @RequirePermissions('forecast:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async keep(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(
      await this.keepAdjustment.execute({ assignmentId: id, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  /**
   * ¿Este tramo o tarea deja a alguien sobre el 100 %? Lo usan los formularios de proyecto antes de
   * guardar, así que basta con poder editar proyectos (no hace falta ver el Forecast).
   */
  @Post('load-preview')
  @RequireAnyPermission('forecast:read', 'projects:manage', 'projects:read_assigned')
  @HttpCode(HttpStatus.OK)
  async loadPreview(
    @Body(new ZodValidationPipe(forecastLoadPreviewInputSchema)) body: ForecastLoadPreviewInput,
  ): Promise<ForecastLoadPreviewResponse> {
    return unwrapOrThrow(await this.previewLoad.execute(body));
  }

  /** "Recalcular desde proyectos" — respeta los ajustes del líder. */
  @Post('recalculate')
  @RequirePermissions('forecast:manage')
  async recalculateAll(): Promise<ForecastRecalculateResponse> {
    return unwrapOrThrow(await this.recalculate.execute());
  }

  @Delete('assignments/:id')
  @RequirePermissions('forecast:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(
      await this.deleteAssignment.execute({ assignmentId: id, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}

function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}
