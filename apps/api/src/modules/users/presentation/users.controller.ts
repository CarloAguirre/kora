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
  changeUserStatusSchema,
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type ChangeUserStatusInput,
  type CreateUserInput,
  type ListUsersQuery,
  type ListUsersResponse,
  type UpdateUserInput,
  type UserDetail,
} from '@kora/contracts';
import { ZodValidationPipe } from '../../../shared/presentation/pipes/zod-validation.pipe';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../shared/presentation/decorators/require-permissions.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../../../shared/presentation/decorators/current-user.decorator';
import type { ActorContext } from '../../../shared/application/use-case';
import { CreateUserUseCase } from '../application/use-cases/create-user.use-case';
import { UpdateUserUseCase } from '../application/use-cases/update-user.use-case';
import { ListUsersUseCase } from '../application/use-cases/list-users.use-case';
import { GetUserUseCase } from '../application/use-cases/get-user.use-case';
import { ChangeUserStatusUseCase } from '../application/use-cases/change-user-status.use-case';
import { DeleteUserUseCase } from '../application/use-cases/delete-user.use-case';
import { GrantUserAccessUseCase } from '../application/use-cases/grant-user-access.use-case';
import { unwrapOrThrow } from '../../../shared/presentation/unwrap-result';

/**
 * Endpoints HTTP del módulo de usuarios.
 *
 * El controlador es deliberadamente delgado: valida la entrada con el esquema
 * compartido, construye el contexto del actor, invoca UN caso de uso y traduce
 * el `Result`. No hay una sola regla de negocio en este archivo — si aparece
 * un `if` sobre roles o estados aquí, está en el lugar equivocado.
 */
@Controller('users')
export class UsersController {
  constructor(
    private readonly createUser: CreateUserUseCase,
    private readonly updateUser: UpdateUserUseCase,
    private readonly listUsers: ListUsersUseCase,
    private readonly getUser: GetUserUseCase,
    private readonly changeStatus: ChangeUserStatusUseCase,
    private readonly deleteUser: DeleteUserUseCase,
    private readonly grantAccess: GrantUserAccessUseCase,
  ) {}

  @Get()
  // `hours:register` cubre el selector de "Líder aprobador" del modal de
  // registro de horas (roles sin `users:read`, p.ej. colaborador, necesitan
  // listar líderes para elegir a quién le aprueban sus horas). El caso de uso
  // fuerza `role: 'leader'` para ese permiso, sin importar lo que pida la query.
  @RequireAnyPermission('users:read', 'hours:register')
  async list(
    @Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery,
    @CurrentUser() actor: RequestUser,
  ): Promise<ListUsersResponse> {
    const result = await this.listUsers.execute({ query, actorPermissions: actor.permissions });
    const page = unwrapOrThrow(result);
    return { ...page, items: [...page.items] };
  }

  @Get(':id')
  @RequirePermissions('users:read')
  async detail(@Param('id') id: string): Promise<UserDetail> {
    return unwrapOrThrow(await this.getUser.execute({ userId: id }));
  }

  @Post()
  @RequirePermissions('users:create')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body(new ZodValidationPipe(createUserSchema)) body: CreateUserInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ id: string; invitationSent: boolean }> {
    const result = await this.createUser.execute({ data: body, actor: toActorContext(actor) });
    const created = unwrapOrThrow(result);
    return { id: created.userId, invitationSent: created.invitationSent };
  }

  @Patch(':id')
  @RequirePermissions('users:update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUserInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.updateUser.execute({ userId: id, data: body, actor: toActorContext(actor) }),
    );
  }

  @Patch(':id/status')
  @RequirePermissions('users:change_status')
  @HttpCode(HttpStatus.NO_CONTENT)
  async setStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeUserStatusSchema)) body: ChangeUserStatusInput,
    @CurrentUser() actor: RequestUser,
  ): Promise<void> {
    unwrapOrThrow(
      await this.changeStatus.execute({ userId: id, data: body, actor: toActorContext(actor) }),
    );
  }

  @Post(':id/access')
  @RequirePermissions('users:reset_password')
  async grantUserAccess(
    @Param('id') id: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<{ invitationSent: boolean; expiresAt: string }> {
    return unwrapOrThrow(
      await this.grantAccess.execute({ userId: id, actor: toActorContext(actor) }),
    );
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    unwrapOrThrow(await this.deleteUser.execute({ userId: id, actor: toActorContext(actor) }));
  }
}

function toActorContext(user: RequestUser): ActorContext {
  return { userId: user.id, email: user.email };
}
