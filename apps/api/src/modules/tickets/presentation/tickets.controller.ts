import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  changeTicketStatusSchema,
  createTicketHhRequestSchema,
  createTicketSchema,
  listTicketLinkableProjectsQuerySchema,
  listTicketsQuerySchema,
  rejectTicketHhRequestSchema,
  updateTicketSchema,
  type ChangeTicketStatusInput,
  type CreateTicketHhRequestInput,
  type CreateTicketInput,
  type ListTicketLinkableProjectsQuery,
  type ListTicketsQuery,
  type ListTicketsResponse,
  type RejectTicketHhRequestInput,
  type TicketDetail,
  type TicketHhRequest,
  type TicketLinkableProject,
  type UpdateTicketInput,
} from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { RequireAnyPermission, RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { ActorContext } from '../../../shared/application/use-case';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { CreateTicketUseCase } from '../application/use-cases/create-ticket.use-case';
import { ListLinkableTicketProjectsUseCase } from '../application/use-cases/list-linkable-ticket-projects.use-case';
import { UpdateTicketUseCase } from '../application/use-cases/update-ticket.use-case';
import { ListTicketsUseCase } from '../application/use-cases/list-tickets.use-case';
import { GetTicketUseCase } from '../application/use-cases/get-ticket.use-case';
import { ChangeTicketStatusUseCase } from '../application/use-cases/change-ticket-status.use-case';
import { DeleteTicketUseCase } from '../application/use-cases/delete-ticket.use-case';
import { CreateTicketHhRequestUseCase } from '../application/use-cases/create-ticket-hh-request.use-case';
import { ListTicketHhRequestsUseCase } from '../application/use-cases/list-ticket-hh-requests.use-case';
import { ApproveTicketHhRequestUseCase } from '../application/use-cases/approve-ticket-hh-request.use-case';
import { RejectTicketHhRequestUseCase } from '../application/use-cases/reject-ticket-hh-request.use-case';

@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly createTicket: CreateTicketUseCase,
    private readonly updateTicket: UpdateTicketUseCase,
    private readonly listTickets: ListTicketsUseCase,
    private readonly getTicket: GetTicketUseCase,
    private readonly changeStatus: ChangeTicketStatusUseCase,
    private readonly deleteTicket: DeleteTicketUseCase,
    private readonly createHhRequest: CreateTicketHhRequestUseCase,
    private readonly listHhRequests: ListTicketHhRequestsUseCase,
    private readonly approveHhRequest: ApproveTicketHhRequestUseCase,
    private readonly rejectHhRequest: RejectTicketHhRequestUseCase,
    private readonly listLinkableProjects: ListLinkableTicketProjectsUseCase,
  ) {}

  @Get()
  @RequireAnyPermission('tickets:read', 'tickets:read_assigned')
  async list(
    @Query(new ZodValidationPipe(listTicketsQuerySchema)) query: ListTicketsQuery,
    @CurrentUser() actor: RequestUser,
  ): Promise<ListTicketsResponse> {
    const page = unwrapOrThrow(
      await this.listTickets.execute({ query, actor: toActorContext(actor), actorPermissions: actor.permissions }),
    );
    return { ...page, items: [...page.items] };
  }

  /**
   * Sirve los selectores "Proyecto"/"Proyecto de desarrollo" del modal de
   * ticket. Debe declararse antes de `:id` — de lo contrario Nest la
   * confundiría con una búsqueda por id. Registrado bajo el permiso de
   * creación/edición de tickets, no `projects:read*`: ver el comentario de
   * `ListLinkableTicketProjectsUseCase`.
   */
  @Get('linkable-projects')
  @RequireAnyPermission('tickets:create', 'tickets:manage', 'tickets:read_assigned')
  async linkableProjects(
    @Query(new ZodValidationPipe(listTicketLinkableProjectsQuerySchema)) query: ListTicketLinkableProjectsQuery,
  ): Promise<TicketLinkableProject[]> {
    return unwrapOrThrow(await this.listLinkableProjects.execute(query));
  }

  @Get(':id')
  @RequireAnyPermission('tickets:read', 'tickets:read_assigned')
  async detail(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<TicketDetail> {
    return unwrapOrThrow(
      await this.getTicket.execute({
        ticketId: id,
        actorUserId: actor.id,
        actorRole: actor.role,
        actorPermissions: actor.permissions,
      }),
    );
  }

  @Post()
  @RequirePermissions('tickets:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createTicketSchema)) body: CreateTicketInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(await this.createTicket.execute({ data: body, actor: toActorContext(actor), actorRole: actor.role }));
  }

  /**
   * `tickets:read_assigned` da acceso al endpoint aunque el actor no tenga
   * `tickets:manage` — el caso de uso decide si puede gestionar ESTE ticket
   * (responsable o autoridad sobre su proyecto), igual que `canModifyTicket`
   * en la v1.
   */
  @Patch(':id')
  @RequireAnyPermission('tickets:manage', 'tickets:read_assigned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTicketSchema)) body: UpdateTicketInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateTicket.execute({
        ticketId: id,
        data: body,
        actor: toActorContext(actor),
        actorRole: actor.role,
        actorPermissions: actor.permissions,
      }),
    );
  }

  @Patch(':id/status')
  @RequireAnyPermission('tickets:manage', 'tickets:read_assigned')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeTicketStatusSchema)) body: ChangeTicketStatusInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.changeStatus.execute({ ticketId: id, data: body, actor: toActorContext(actor), actorPermissions: actor.permissions }),
    );
  }

  @Delete(':id')
  @RequirePermissions('tickets:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.deleteTicket.execute({ ticketId: id, actor: toActorContext(actor), actorRole: actor.role }));
  }

  @Get(':id/hh-requests')
  @RequireAnyPermission('tickets:read', 'tickets:read_assigned')
  async listHhRequestsForTicket(@Param('id') id: string): Promise<TicketHhRequest[]> {
    return unwrapOrThrow(await this.listHhRequests.execute({ ticketId: id }));
  }

  @Post(':id/hh-requests')
  @RequirePermissions('hours:register')
  @HttpCode(HttpStatus.CREATED)
  async createHhRequestForTicket(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createTicketHhRequestSchema)) body: CreateTicketHhRequestInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.createHhRequest.execute({ ticketId: id, data: body, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  @Patch(':id/hh-requests/:requestId/approve')
  @RequirePermissions('hours:approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async approveHhRequestForTicket(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.approveHhRequest.execute({ ticketId: id, requestId, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }

  @Patch(':id/hh-requests/:requestId/reject')
  @RequirePermissions('hours:approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rejectHhRequestForTicket(
    @Param('id') id: string,
    @Param('requestId') requestId: string,
    @Body(new ZodValidationPipe(rejectTicketHhRequestSchema)) body: RejectTicketHhRequestInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.rejectHhRequest.execute({ ticketId: id, requestId, data: body, actor: toActorContext(actor), actorRole: actor.role }),
    );
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
