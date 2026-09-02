import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  addTeamMemberSchema,
  createTeamSchema,
  listTeamsQuerySchema,
  teamAvailabilityQuerySchema,
  updateTeamMemberSchema,
  updateTeamSchema,
  type AddTeamMemberInput,
  type CreateTeamInput,
  type ListTeamMemberOptionsResponse,
  type ListTeamsQuery,
  type ListTeamsResponse,
  type TeamAvailabilityQuery,
  type TeamAvailabilityResponse,
  type TeamDetail,
  type UpdateTeamInput,
  type UpdateTeamMemberInput,
} from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import { CurrentUser, type RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import type { ActorContext } from '../../../shared/application/use-case';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { CreateTeamUseCase } from '../application/use-cases/create-team.use-case';
import { UpdateTeamUseCase } from '../application/use-cases/update-team.use-case';
import { ListTeamsUseCase } from '../application/use-cases/list-teams.use-case';
import { GetTeamUseCase } from '../application/use-cases/get-team.use-case';
import { GetTeamAvailabilityUseCase } from '../application/use-cases/get-team-availability.use-case';
import { DeleteTeamUseCase } from '../application/use-cases/delete-team.use-case';
import { AddTeamMemberUseCase } from '../application/use-cases/add-team-member.use-case';
import { RemoveTeamMemberUseCase } from '../application/use-cases/remove-team-member.use-case';
import { UpdateTeamMemberUseCase } from '../application/use-cases/update-team-member.use-case';
import { ListTeamMemberOptionsUseCase } from '../application/use-cases/list-team-member-options.use-case';

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly createTeam: CreateTeamUseCase,
    private readonly updateTeam: UpdateTeamUseCase,
    private readonly listTeams: ListTeamsUseCase,
    private readonly getTeam: GetTeamUseCase,
    private readonly getTeamAvailability: GetTeamAvailabilityUseCase,
    private readonly deleteTeam: DeleteTeamUseCase,
    private readonly addMember: AddTeamMemberUseCase,
    private readonly removeMember: RemoveTeamMemberUseCase,
    private readonly updateMember: UpdateTeamMemberUseCase,
    private readonly listMemberOptions: ListTeamMemberOptionsUseCase,
  ) {}

  /**
   * Todos los miembros activos de todos los equipos, para el buscador por
   * nombre al asignar a un proyecto. Declarada antes de `:id` para que
   * Nest no la confunda con un id de equipo.
   */
  @Get('members')
  @RequirePermissions('teams:read')
  async memberOptions(): Promise<ListTeamMemberOptionsResponse> {
    const items = unwrapOrThrow(await this.listMemberOptions.execute());
    return { items };
  }

  @Get()
  @RequirePermissions('teams:read')
  async list(
    @Query(new ZodValidationPipe(listTeamsQuerySchema)) query: ListTeamsQuery,
  ): Promise<ListTeamsResponse> {
    const page = unwrapOrThrow(await this.listTeams.execute({ query }));
    return { ...page, items: [...page.items] };
  }

  @Get(':id')
  @RequirePermissions('teams:read')
  async detail(@Param('id') id: string): Promise<TeamDetail> {
    return unwrapOrThrow(await this.getTeam.execute({ teamId: id }));
  }

  /** Heatmap "Disponibilidad": horas aprobadas por colaborador y día en el rango. */
  @Get(':id/availability')
  @RequirePermissions('teams:read')
  async availability(
    @Param('id') id: string,
    @Query(new ZodValidationPipe(teamAvailabilityQuerySchema)) query: TeamAvailabilityQuery,
  ): Promise<TeamAvailabilityResponse> {
    return unwrapOrThrow(
      await this.getTeamAvailability.execute({ teamId: id, dateFrom: query.dateFrom, dateTo: query.dateTo }),
    );
  }

  @Post()
  @RequirePermissions('teams:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createTeamSchema)) body: CreateTeamInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(await this.createTeam.execute({ data: body, actor: toActorContext(actor) }));
  }

  @Patch(':id')
  @RequirePermissions('teams:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateTeamSchema)) body: UpdateTeamInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(await this.updateTeam.execute({ teamId: id, data: body, actor: toActorContext(actor) }));
  }

  @Delete(':id')
  @RequirePermissions('teams:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.deleteTeam.execute({ teamId: id, actor: toActorContext(actor) }));
  }

  @Post(':id/members')
  @RequirePermissions('teams:manage')
  @HttpCode(HttpStatus.CREATED)
  async addTeamMember(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addTeamMemberSchema)) body: AddTeamMemberInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(
      await this.addMember.execute({ teamId: id, data: body, actor: toActorContext(actor) }),
    );
  }

  @Patch(':id/members/:memberId')
  @RequirePermissions('teams:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateTeamMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(updateTeamMemberSchema)) body: UpdateTeamMemberInput,
  ): Promise<void> {
    unwrapOrThrow(await this.updateMember.execute({ teamId: id, memberId, data: body }));
  }

  @Delete(':id/members/:memberId')
  @RequirePermissions('teams:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeTeamMember(
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.removeMember.execute({ teamId: id, memberId, actor: toActorContext(actor) }),
    );
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
