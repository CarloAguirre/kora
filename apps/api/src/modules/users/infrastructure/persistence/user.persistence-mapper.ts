import type { RoleCode, UserStatus } from '@kora/contracts';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { PersonName } from '../../domain/value-objects/person-name.vo';

/**
 * Traducción entre las filas de Postgres y el agregado `User`.
 *
 * Este es el único archivo que sabe a la vez cómo es la tabla y cómo es la
 * entidad. Cambiar un nombre de columna se resuelve aquí y en ningún otro
 * sitio; el dominio no se entera.
 */

export interface UserRow {
  id: string;
  legacyId: number | null;
  legacyAuthUserId: string | null;
  email: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  teamId: string | null;
  status: string;
  isCommercialManager: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toDomain(row: UserRow): User {
  // Los value objects se reconstruyen con `unwrap`: si un dato ya persistido no
  // pasa su propia validación, es un fallo de integridad y debe explotar aquí,
  // ruidosamente, en lugar de propagarse por el sistema.
  const email = Email.create(row.email).unwrap();
  const name = PersonName.create(row.firstName, row.lastName).unwrap();

  return User.restore({
    id: row.id,
    email,
    name,
    role: row.roleCode as RoleCode,
    teamId: row.teamId,
    status: row.status as UserStatus,
    isCommercialManager: row.isCommercialManager,
    legacyId: row.legacyId,
    legacyAuthUserId: row.legacyAuthUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    deletedAt: row.deletedAt,
  });
}

export interface UserPersistenceValues {
  email: string;
  firstName: string;
  lastName: string;
  teamId: string | null;
  status: UserStatus;
  isCommercialManager: boolean;
  legacyId: number | null;
  legacyAuthUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export function toPersistence(user: User): UserPersistenceValues & { roleCode: RoleCode } {
  const snapshot = user.toSnapshot();
  return {
    email: snapshot.email,
    firstName: snapshot.firstName,
    lastName: snapshot.lastName,
    roleCode: snapshot.role,
    teamId: snapshot.teamId,
    status: snapshot.status,
    isCommercialManager: snapshot.isCommercialManager,
    legacyId: snapshot.legacyId,
    legacyAuthUserId: snapshot.legacyAuthUserId,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    deletedAt: snapshot.deletedAt,
  };
}
