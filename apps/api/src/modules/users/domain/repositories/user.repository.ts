import type { Page, PageRequest, SortRequest, TransactionContext } from '@kora/core';
import type { RoleCode, UserStatus } from '@kora/contracts';
import type { User } from '../entities/user.entity';
import type { Email } from '../value-objects/email.vo';

/**
 * Puerto de persistencia de usuarios.
 *
 * Lo define el dominio y lo implementa infraestructura: es la Inversión de
 * Dependencias en su forma más literal. El dominio no sabe que existe Postgres,
 * y los tests de los casos de uso usan una implementación en memoria sin
 * levantar nada.
 *
 * El puerto habla de conceptos de negocio (`findByEmail`, `existsActiveAdmin`),
 * nunca de SQL. Si un método solo tiene sentido explicándolo con una consulta,
 * está mal planteado.
 */

export interface UserFilters {
  readonly search?: string | undefined;
  readonly role?: RoleCode | undefined;
  readonly status?: UserStatus | undefined;
  readonly teamId?: string | undefined;
  readonly isCommercialManager?: boolean | undefined;
  /** Por defecto los eliminados quedan fuera de todo listado. */
  readonly includeDeleted?: boolean | undefined;
}

export type UserSortableField =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'role'
  | 'team'
  | 'status'
  | 'createdAt';

/** Proyección de lectura: incluye datos derivados que no pertenecen al agregado. */
export interface UserListItem {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly role: RoleCode;
  readonly status: UserStatus;
  readonly teamId: string | null;
  readonly teamName: string | null;
  readonly isCommercialManager: boolean;
  readonly hasAccountAccess: boolean;
  readonly lastLoginAt: Date | null;
  readonly createdAt: Date;
}

export interface UserRepository {
  findById(id: string, context?: TransactionContext): Promise<User | null>;
  /** Solo usuarios vigentes: el correo puede repetirse entre eliminados. */
  findByEmail(email: Email, context?: TransactionContext): Promise<User | null>;
  findByLegacyId(legacyId: number, context?: TransactionContext): Promise<User | null>;

  /** Búsqueda paginada para el listado administrativo. */
  search(
    filters: UserFilters,
    page: PageRequest,
    sort: SortRequest<UserSortableField>,
    context?: TransactionContext,
  ): Promise<Page<UserListItem>>;

  save(user: User, actorUserId: string | null, context?: TransactionContext): Promise<void>;

  /**
   * Cuenta los administradores activos EXCLUYENDO al indicado.
   *
   * Existe para poder responder "¿queda alguien más si degrado o desactivo a
   * éste?" en una sola consulta, sin traerse todos los usuarios a memoria.
   */
  countActiveAdminsExcluding(userId: string, context?: TransactionContext): Promise<number>;

  /** Verdadero si el correo ya lo usa otro usuario distinto del indicado. */
  emailIsTakenByAnother(
    email: Email,
    excludingUserId: string | null,
    context?: TransactionContext,
  ): Promise<boolean>;
}

export const USER_REPOSITORY = Symbol('UserRepository');
