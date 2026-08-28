import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  changeClientStatusSchema,
  createClientSchema,
  listClientsQuerySchema,
  updateClientSchema,
  type ChangeClientStatusInput,
  type ClientDetail,
  type ClientsStats,
  type CreateClientInput,
  type ListClientsQuery,
  type ListClientsResponse,
  type UpdateClientInput,
} from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import { RequirePermissions } from '../../../shared/presentation/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../../../shared/presentation/decorators/current-user.decorator';
import type { ActorContext } from '../../../shared/application/use-case';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';
import { CreateClientUseCase } from '../application/use-cases/create-client.use-case';
import { UpdateClientUseCase } from '../application/use-cases/update-client.use-case';
import { ListClientsUseCase } from '../application/use-cases/list-clients.use-case';
import { GetClientUseCase } from '../application/use-cases/get-client.use-case';
import { ChangeClientStatusUseCase } from '../application/use-cases/change-client-status.use-case';
import { DeleteClientUseCase } from '../application/use-cases/delete-client.use-case';
import { GetClientsStatsUseCase } from '../application/use-cases/get-clients-stats.use-case';
import {
  ListClientFormOptionsUseCase,
  type ClientFormOptions,
} from '../application/use-cases/list-form-options.use-case';

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly createClient: CreateClientUseCase,
    private readonly updateClient: UpdateClientUseCase,
    private readonly listClients: ListClientsUseCase,
    private readonly getClient: GetClientUseCase,
    private readonly changeStatus: ChangeClientStatusUseCase,
    private readonly deleteClient: DeleteClientUseCase,
    private readonly formOptions: ListClientFormOptionsUseCase,
    private readonly getStats: GetClientsStatsUseCase,
  ) {}

  @Get('form-options')
  @RequirePermissions('clients:read')
  async options(): Promise<ClientFormOptions> {
    return unwrapOrThrow(await this.formOptions.execute());
  }

  @Get('stats')
  @RequirePermissions('clients:read')
  async stats(): Promise<ClientsStats> {
    return unwrapOrThrow(await this.getStats.execute());
  }

  @Get()
  @RequirePermissions('clients:read')
  async list(
    @Query(new ZodValidationPipe(listClientsQuerySchema)) query: ListClientsQuery,
  ): Promise<ListClientsResponse> {
    const page = unwrapOrThrow(await this.listClients.execute({ query }));
    return { ...page, items: [...page.items] };
  }

  @Get(':id')
  @RequirePermissions('clients:read')
  async detail(@Param('id') id: string): Promise<ClientDetail> {
    return unwrapOrThrow(await this.getClient.execute({ clientId: id }));
  }

  @Post()
  @RequirePermissions('clients:manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string }> {
    return unwrapOrThrow(await this.createClient.execute({ data: body, actor: toActorContext(actor) }));
  }

  @Patch(':id')
  @RequirePermissions('clients:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateClient.execute({ clientId: id, data: body, actor: toActorContext(actor) }),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('clients:manage')
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeClientStatusSchema)) body: ChangeClientStatusInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ affectedProjects: number }> {
    return unwrapOrThrow(
      await this.changeStatus.execute({ clientId: id, data: body, actor: toActorContext(actor) }),
    );
  }

  @Delete(':id')
  @RequirePermissions('clients:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.deleteClient.execute({ clientId: id, actor: toActorContext(actor) }));
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
