import { Inject, Injectable } from '@nestjs/common';
import { mapPage, ok, type Page, type Result } from '@kora/core';
import type { ListUsersQuery, Permission, UserSummary } from '@kora/contracts';
import {
  USER_REPOSITORY,
  type UserListItem,
  type UserRepository,
} from '../../domain/repositories/user.repository';
import {
  LEADER_PROFILE_RESOLVER,
  type LeaderProfileResolver,
} from '../ports/leader-profile-resolver.port';
import type { UseCase } from '../../../../shared/application/use-case';
import { toUserSummary } from '../mappers/user.mapper';

export interface ListUsersQueryCommand {
  readonly query: ListUsersQuery;
  readonly actorPermissions: readonly Permission[];
}

/**
 * Listado administrativo de usuarios.
 *
 * Es una consulta, no un comando: no modifica nada y devuelve una proyección de
 * lectura, no entidades. Reconstruir el agregado `User` para pintar una tabla
 * sería trabajo desperdiciado, así que el repositorio devuelve `UserListItem`
 * plano y este caso de uso lo enriquece con lo que la tabla necesita.
 *
 * El perfil de líder se resuelve EN LOTE para toda la página. La v1 lo
 * calculaba por usuario con dos consultas cada uno, lo que en una página de 25
 * líderes eran 50 idas y vueltas al servidor.
 *
 * Sin `users:read`, el actor solo llega aquí vía `hours:register` (selector de
 * "Líder aprobador" del modal de registro de horas) — el filtro se fuerza a
 * `role: 'leader'` sin importar lo que pida la consulta, para no convertir ese
 * permiso en un listado abierto de toda la plantilla.
 */
@Injectable()
export class ListUsersUseCase implements UseCase<ListUsersQueryCommand, Page<UserSummary>> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(LEADER_PROFILE_RESOLVER) private readonly leaderProfiles: LeaderProfileResolver,
  ) {}

  async execute(command: ListUsersQueryCommand): Promise<Result<Page<UserSummary>>> {
    const { query, actorPermissions } = command;
    const hasFullRead = actorPermissions.includes('users:read');

    const page = await this.users.search(
      {
        search: query.search,
        role: hasFullRead ? query.role : 'leader',
        status: query.status,
        teamId: query.teamId,
        isCommercialManager: query.isCommercialManager,
      },
      { page: query.page, pageSize: query.pageSize },
      { field: query.sortField, direction: query.sortDirection },
    );

    const leaderIds = page.items.filter((item) => item.role === 'leader').map((item) => item.id);
    const profiles =
      leaderIds.length > 0 ? await this.leaderProfiles.resolveMany(leaderIds) : new Map();

    return ok(
      mapPage(page, (item: UserListItem) =>
        toUserSummary(item, profiles.get(item.id) ?? null),
      ),
    );
  }
}
