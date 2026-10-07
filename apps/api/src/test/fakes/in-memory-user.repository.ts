import { buildPage, type Page, type PageRequest, type SortRequest } from '@kora/core';
import type { RoleCode } from '@kora/contracts';
import type { User } from '../../modules/users/domain/entities/user.entity';
import type { Email } from '../../modules/users/domain/value-objects/email.vo';
import type {
  UserFilters,
  UserListItem,
  UserRepository,
  UserSortableField,
} from '../../modules/users/domain/repositories/user.repository';

/**
 * Repositorio en memoria para los tests de casos de uso.
 *
 * Existe porque el caso de uso depende del PUERTO, no de Drizzle. Gracias a eso
 * un test de "no puedes dejar el sistema sin administradores" se ejecuta en
 * milisegundos y sin Postgres. En la v1 ese mismo test habría requerido
 * levantar PGlite y reproducir 160 migraciones — que es literalmente lo que
 * hacen sus tests de RLS.
 */
export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  seed(...users: User[]): this {
    for (const user of users) this.users.set(user.id, user);
    return this;
  }

  all(): User[] {
    return [...this.users.values()];
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    return this.all().find((user) => !user.isDeleted && user.email.equals(email)) ?? null;
  }

  async findByLegacyId(legacyId: number): Promise<User | null> {
    return this.all().find((user) => user.legacyId === legacyId) ?? null;
  }

  async search(
    filters: UserFilters,
    page: PageRequest,
    _sort: SortRequest<UserSortableField>,
  ): Promise<Page<UserListItem>> {
    const matches = this.all()
      .filter((user) => (filters.includeDeleted ? true : !user.isDeleted))
      .filter((user) => (filters.role ? user.role === filters.role : true))
      .filter((user) => (filters.status ? user.status === filters.status : true))
      .filter((user) => (filters.teamId ? user.teamId === filters.teamId : true));

    const items: UserListItem[] = matches.map((user) => ({
      id: user.id,
      email: user.email.value,
      firstName: user.name.firstName,
      lastName: user.name.lastName,
      role: user.role as RoleCode,
      status: user.status,
      teamId: user.teamId,
      teamName: null,
      isCommercialManager: user.isCommercialManager,
      hasAccountAccess: false,
      lastLoginAt: null,
      createdAt: user.createdAt,
    }));

    const start = (page.page - 1) * page.pageSize;
    return buildPage(items.slice(start, start + page.pageSize), items.length, page);
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async countActiveAdminsExcluding(userId: string): Promise<number> {
    return this.all().filter(
      (user) =>
        user.id !== userId &&
        !user.isDeleted &&
        user.status === 'active' &&
        (user.role === 'admin' || user.role === 'pmo'),
    ).length;
  }

  async emailIsTakenByAnother(email: Email, excludingUserId: string | null): Promise<boolean> {
    return this.all().some(
      (user) => !user.isDeleted && user.id !== excludingUserId && user.email.equals(email),
    );
  }
}
