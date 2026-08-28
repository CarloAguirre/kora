import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  isNull,
  ne,
  or,
  roles,
  sql,
  teams,
  userCredentials,
  users,
  type Database,
} from '@kora/db';
import { buildPage, toOffset, type Page, type PageRequest, type SortRequest, type TransactionContext } from '@kora/core';
import type { RoleCode } from '@kora/contracts';
import type {
  UserFilters,
  UserListItem,
  UserRepository,
  UserSortableField,
} from '../../domain/repositories/user.repository';
import type { User } from '../../domain/entities/user.entity';
import type { Email } from '../../domain/value-objects/email.vo';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';
import { resolveDb } from '../../../../shared/infrastructure/database/unit-of-work';
import { toDomain, toPersistence } from './user.persistence-mapper';
import { RoleCatalog } from './role-catalog';

/**
 * Implementación del puerto `UserRepository` sobre Drizzle/Postgres.
 *
 * Todo el SQL del módulo de usuarios está aquí. Ningún caso de uso importa
 * Drizzle, así que reemplazar el ORM —o incluso el motor— es sustituir esta
 * clase y sus hermanas, sin tocar una sola regla de negocio ni un solo test de
 * dominio.
 */
@Injectable()
export class DrizzleUserRepository implements UserRepository {
  constructor(
    @Inject(DATABASE) private readonly database: Database,
    private readonly roleCatalog: RoleCatalog,
  ) {}

  async findById(id: string, context?: TransactionContext): Promise<User | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(this.aggregateColumns())
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.id, id))
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async findByEmail(email: Email, context?: TransactionContext): Promise<User | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(this.aggregateColumns())
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(sql`lower(btrim(${users.email})) = ${email.value}`)
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async findByLegacyId(legacyId: number, context?: TransactionContext): Promise<User | null> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select(this.aggregateColumns())
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(eq(users.legacyId, legacyId))
      .limit(1);

    const row = rows[0];
    return row ? toDomain(row) : null;
  }

  async search(
    filters: UserFilters,
    page: PageRequest,
    sort: SortRequest<UserSortableField>,
    context?: TransactionContext,
  ): Promise<Page<UserListItem>> {
    const db = resolveDb(this.database, context);
    const where = this.buildWhere(filters);

    // El total y la página se piden a la vez: son consultas independientes y
    // esperarlas en serie duplicaría la latencia del listado.
    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          roleCode: roles.code,
          status: users.status,
          teamId: users.teamId,
          teamName: teams.name,
          isCommercialManager: users.isCommercialManager,
          // Tener credencial es lo que distingue una ficha de personal de una
          // cuenta que puede entrar al sistema.
          hasAccountAccess: sql<boolean>`(${userCredentials.userId} is not null)`,
          lastLoginAt: userCredentials.lastLoginAt,
          createdAt: users.createdAt,
        })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .leftJoin(teams, eq(teams.id, users.teamId))
        .leftJoin(userCredentials, eq(userCredentials.userId, users.id))
        .where(where)
        .orderBy(...this.buildOrderBy(sort))
        .limit(page.pageSize)
        .offset(toOffset(page)),

      db
        .select({ value: count() })
        .from(users)
        .innerJoin(roles, eq(roles.id, users.roleId))
        .leftJoin(teams, eq(teams.id, users.teamId))
        .where(where),
    ]);

    const items: UserListItem[] = rows.map((row) => ({
      id: row.id,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.roleCode as RoleCode,
      status: row.status,
      teamId: row.teamId,
      teamName: row.teamName ?? null,
      isCommercialManager: row.isCommercialManager,
      hasAccountAccess: Boolean(row.hasAccountAccess),
      lastLoginAt: row.lastLoginAt,
      createdAt: row.createdAt,
    }));

    return buildPage(items, totalRows[0]?.value ?? 0, page);
  }

  async save(user: User, actorUserId: string | null, context?: TransactionContext): Promise<void> {
    const db = resolveDb(this.database, context);
    const values = toPersistence(user);
    const roleId = await this.roleCatalog.idFor(values.roleCode, db);

    await db
      .insert(users)
      .values({
        id: user.id,
        legacyId: values.legacyId,
        legacyAuthUserId: values.legacyAuthUserId,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        roleId,
        teamId: values.teamId,
        status: values.status,
        isCommercialManager: values.isCommercialManager,
        createdBy: actorUserId,
        updatedBy: actorUserId,
        createdAt: values.createdAt,
        updatedAt: values.updatedAt,
        deletedAt: values.deletedAt,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: values.email,
          firstName: values.firstName,
          lastName: values.lastName,
          roleId,
          teamId: values.teamId,
          status: values.status,
          isCommercialManager: values.isCommercialManager,
          updatedBy: actorUserId,
          updatedAt: values.updatedAt,
          deletedAt: values.deletedAt,
        },
      });
  }

  async countActiveAdminsExcluding(
    userId: string,
    context?: TransactionContext,
  ): Promise<number> {
    const db = resolveDb(this.database, context);

    const rows = await db
      .select({ value: count() })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .where(
        and(
          eq(roles.isAdminTier, true),
          eq(users.status, 'active'),
          isNull(users.deletedAt),
          ne(users.id, userId),
        ),
      );

    return rows[0]?.value ?? 0;
  }

  async emailIsTakenByAnother(
    email: Email,
    excludingUserId: string | null,
    context?: TransactionContext,
  ): Promise<boolean> {
    const db = resolveDb(this.database, context);

    const conditions = [
      sql`lower(btrim(${users.email})) = ${email.value}`,
      isNull(users.deletedAt),
    ];
    if (excludingUserId) conditions.push(ne(users.id, excludingUserId));

    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...conditions))
      .limit(1);

    return rows.length > 0;
  }

  // ───────────────────────────── Ayudas privadas ─────────────────────────────

  private aggregateColumns() {
    return {
      id: users.id,
      legacyId: users.legacyId,
      legacyAuthUserId: users.legacyAuthUserId,
      email: users.email,
      firstName: users.firstName,
      lastName: users.lastName,
      roleCode: roles.code,
      teamId: users.teamId,
      status: users.status,
      isCommercialManager: users.isCommercialManager,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
      deletedAt: users.deletedAt,
    };
  }

  private buildWhere(filters: UserFilters) {
    const conditions = [];

    if (!filters.includeDeleted) {
      conditions.push(isNull(users.deletedAt));
    }
    if (filters.role) {
      conditions.push(eq(roles.code, filters.role));
    }
    if (filters.status) {
      conditions.push(eq(users.status, filters.status));
    }
    if (filters.teamId) {
      conditions.push(eq(users.teamId, filters.teamId));
    }
    if (filters.isCommercialManager !== undefined) {
      conditions.push(eq(users.isCommercialManager, filters.isCommercialManager));
    }
    if (filters.search) {
      // Una sola caja de búsqueda que cubre nombre, apellido y correo: es como
      // busca de verdad un administrador, y evita tres filtros separados.
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(users.firstName, term),
          ilike(users.lastName, term),
          ilike(users.email, term),
          sql`(${users.firstName} || ' ' || ${users.lastName}) ilike ${term}`,
        ),
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  private buildOrderBy(sort: SortRequest<UserSortableField>) {
    const direction = sort.direction === 'desc' ? desc : asc;

    const column = {
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: roles.displayOrder,
      team: teams.name,
      status: users.status,
      createdAt: users.createdAt,
    }[sort.field];

    // El segundo criterio hace la paginación estable: sin él, dos usuarios con
    // el mismo nombre podrían intercambiarse entre páginas.
    return [direction(column), asc(users.id)];
  }
}
