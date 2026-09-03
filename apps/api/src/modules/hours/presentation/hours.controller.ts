import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  availabilityQuerySchema,
  createHourEntrySchema,
  listCapacityReportQuerySchema,
  listHourEntriesQuerySchema,
  rejectHourEntrySchema,
  updateHourEntrySchema,
  type AvailabilityQuery,
  type AvailabilityResponse,
  type CreateHourEntryInput,
  type HourEntryDetail,
  type ListCapacityReportQuery,
  type ListCapacityReportResponse,
  type ListHourEntriesQuery,
  type ListHourEntriesResponse,
  type ProjectPendingApprovalsResponse,
  type RejectHourEntryInput,
  type UpdateHourEntryInput,
} from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { ActorContext } from '../../../shared/application/use-case';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { CreateHourEntryUseCase } from '../application/use-cases/create-hour-entry.use-case';
import { UpdateHourEntryUseCase } from '../application/use-cases/update-hour-entry.use-case';
import { ListHourEntriesUseCase } from '../application/use-cases/list-hour-entries.use-case';
import { GetHourEntryUseCase } from '../application/use-cases/get-hour-entry.use-case';
import { ApproveHourEntryUseCase } from '../application/use-cases/approve-hour-entry.use-case';
import { RejectHourEntryUseCase } from '../application/use-cases/reject-hour-entry.use-case';
import { DeleteHourEntryUseCase } from '../application/use-cases/delete-hour-entry.use-case';
import { GetHoursCapacityReportUseCase } from '../application/use-cases/get-hours-capacity-report.use-case';
import { GetHoursAvailabilityUseCase } from '../application/use-cases/get-hours-availability.use-case';
import { GetProjectPendingApprovalsUseCase } from '../application/use-cases/get-project-pending-approvals.use-case';

@Controller('hour-entries')
export class HoursController {
  constructor(
    private readonly createEntry: CreateHourEntryUseCase,
    private readonly updateEntry: UpdateHourEntryUseCase,
    private readonly listEntries: ListHourEntriesUseCase,
    private readonly getEntry: GetHourEntryUseCase,
    private readonly approveEntry: ApproveHourEntryUseCase,
    private readonly rejectEntry: RejectHourEntryUseCase,
    private readonly deleteEntry: DeleteHourEntryUseCase,
    private readonly getCapacityReport: GetHoursCapacityReportUseCase,
    private readonly getAvailability: GetHoursAvailabilityUseCase,
    private readonly getProjectPendingApprovals: GetProjectPendingApprovalsUseCase,
  ) {}

  @Get()
  @RequirePermissions('hours:read_own')
  async list(
    @Query(new ZodValidationPipe(listHourEntriesQuerySchema)) query: ListHourEntriesQuery,
    @CurrentUser() actor: RequestUser,
  ): Promise<ListHourEntriesResponse> {
    const page = unwrapOrThrow(
      await this.listEntries.execute({ query, actor: toActorContext(actor), actorPermissions: actor.permissions }),
    );
    return { ...page, items: [...page.items] };
  }

  /** Pestaña "Capacity" de Administración — ver docs/DECISION-M4-HORAS.md. */
  @Get('capacity-report')
  @RequirePermissions('hours:read_all')
  async capacityReport(
    @Query(new ZodValidationPipe(listCapacityReportQuerySchema)) query: ListCapacityReportQuery,
  ): Promise<ListCapacityReportResponse> {
    const page = unwrapOrThrow(await this.getCapacityReport.execute({ query }));
    return { ...page, items: [...page.items] };
  }

  /** Pestaña "Registro de Horas" (disponibilidad) de Administración. */
  @Get('availability')
  @RequirePermissions('hours:read_all')
  async availability(
    @Query(new ZodValidationPipe(availabilityQuerySchema)) query: AvailabilityQuery,
  ): Promise<AvailabilityResponse> {
    return unwrapOrThrow(await this.getAvailability.execute({ query }));
  }

  /**
   * Horas pendientes que quedaron EXCLUYENTEMENTE con un líder de equipo, no
   * con el propio líder de proyecto — ver `GetProjectPendingApprovalsUseCase`.
   * Solo visible para el líder de ESE proyecto (o admin/pmo); `hours:approve`
   * acota el endpoint a quien puede aprobar horas en general, y el caso de
   * uso verifica el liderazgo puntual del proyecto.
   */
  @Get('projects/:projectId/pending-approvals')
  @RequirePermissions('hours:approve')
  async projectPendingApprovals(
    @Param('projectId') projectId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<ProjectPendingApprovalsResponse> {
    return unwrapOrThrow(
      await this.getProjectPendingApprovals.execute({
        projectId,
        actor: toActorContext(actor),
        actorRole: actor.role,
      }),
    );
  }

  @Get(':id')
  @RequirePermissions('hours:read_own')
  async detail(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<HourEntryDetail> {
    return unwrapOrThrow(
      await this.getEntry.execute({ entryId: id, actor: toActorContext(actor), actorPermissions: actor.permissions }),
    );
  }

  @Post()
  @RequirePermissions('hours:register')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createHourEntrySchema)) body: CreateHourEntryInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.createEntry.execute({ data: body, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  @Patch(':id')
  @RequirePermissions('hours:register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateHourEntrySchema)) body: UpdateHourEntryInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateEntry.execute({ entryId: id, data: body, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  @Patch(':id/approve')
  @RequirePermissions('hours:approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approve(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.approveEntry.execute({ entryId: id, actor: toActorContext(actor), actorRole: actor.role }));
  }

  @Patch(':id/reject')
  @RequirePermissions('hours:approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reject(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(rejectHourEntrySchema)) body: RejectHourEntryInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.rejectEntry.execute({ entryId: id, data: body, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  @Delete(':id')
  @RequirePermissions('hours:register')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.deleteEntry.execute({ entryId: id, actor: toActorContext(actor), actorRole: actor.role }));
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
