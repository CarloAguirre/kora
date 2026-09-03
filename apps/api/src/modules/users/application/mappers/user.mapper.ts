import type { LeaderProfile, Permission, UserDetail, UserSummary } from '@kora/contracts';
import type { UserListItem } from '../../domain/repositories/user.repository';
import type { User } from '../../domain/entities/user.entity';
import type { UserCredentialState } from '../../domain/repositories/user-credential.repository';

/**
 * Traducción entre el modelo interno y el contrato público de la API.
 *
 * Existe para que renombrar un campo del dominio no rompa a todos los clientes,
 * y —más importante— para que sea imposible que un campo interno se escape sin
 * querer: la salida se construye campo a campo, nunca esparciendo la entidad.
 */

export function toUserSummary(
  item: UserListItem,
  leaderProfile: LeaderProfile | null,
): UserSummary {
  return {
    id: item.id,
    email: item.email,
    firstName: item.firstName,
    lastName: item.lastName,
    fullName: `${item.firstName} ${item.lastName}`,
    role: item.role,
    status: item.status,
    team: item.teamId && item.teamName ? { id: item.teamId, name: item.teamName } : null,
    isCommercialManager: item.isCommercialManager,
    leaderProfile: item.role === 'leader' ? leaderProfile : null,
    hasAccountAccess: item.hasAccountAccess,
    lastLoginAt: item.lastLoginAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  };
}

export interface UserDetailSource {
  readonly user: User;
  readonly teamName: string | null;
  readonly credentials: UserCredentialState | null;
  readonly permissions: readonly Permission[];
  readonly leaderProfile: LeaderProfile | null;
}

export function toUserDetail(source: UserDetailSource): UserDetail {
  const { user, teamName, credentials, permissions, leaderProfile } = source;
  const snapshot = user.toSnapshot();

  return {
    id: snapshot.id,
    email: snapshot.email,
    firstName: snapshot.firstName,
    lastName: snapshot.lastName,
    fullName: user.name.fullName,
    role: snapshot.role,
    status: snapshot.status,
    team: snapshot.teamId && teamName ? { id: snapshot.teamId, name: teamName } : null,
    isCommercialManager: snapshot.isCommercialManager,
    leaderProfile: snapshot.role === 'leader' ? leaderProfile : null,
    hasAccountAccess: credentials !== null,
    lastLoginAt: credentials?.lastLoginAt?.toISOString() ?? null,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    // Nunca se exponen `passwordHash` ni `passwordAlgorithm`: no aparecen aquí,
    // y por eso no pueden filtrarse por un cambio despistado en el futuro.
    permissions: [...permissions],
    mustChangePassword: credentials?.mustChangePassword ?? false,
    emailVerifiedAt: credentials?.emailVerifiedAt?.toISOString() ?? null,
    passwordUpdatedAt: credentials?.passwordUpdatedAt?.toISOString() ?? null,
    lockedUntil: credentials?.lockedUntil?.toISOString() ?? null,
    failedLoginAttempts: credentials?.failedAttempts ?? 0,
    legacyId: snapshot.legacyId,
  };
}
