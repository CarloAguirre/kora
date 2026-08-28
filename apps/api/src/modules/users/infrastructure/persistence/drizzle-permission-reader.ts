import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  isNull,
  or,
  gt,
  permissions,
  rolePermissions,
  roles,
  sql,
  userPermissionOverrides,
  users,
  type Database,
} from '@kora/db';
import type { Permission, RoleCode } from '@kora/contracts';
import type {
  EffectivePermissions,
  PermissionReader,
} from '../../application/ports/permission-reader.port';
import { DATABASE } from '../../../../shared/infrastructure/database/database.module';

/**
 * Calcula los permisos efectivos de un usuario.
 *
 * La regla de resolución es: se parte de los permisos del rol, se suman las
 * concesiones puntuales vigentes y se restan las revocaciones puntuales. Una
 * revocación gana siempre, incluso sobre una concesión, porque quitar acceso
 * debe ser la operación más difícil de anular por accidente.
 *
 * Todo se resuelve en UNA consulta. Traer permisos, luego excepciones, y
 * combinarlos en JavaScript funcionaría, pero se ejecuta en cada login y no hay
 * razón para pagar tres viajes a la base.
 */
@Injectable()
export class DrizzlePermissionReader implements PermissionReader {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async forUser(userId: string): Promise<EffectivePermissions | null> {
    const rows = await this.database
      .select({
        roleCode: roles.code,
        permissionCode: permissions.code,
        effect: userPermissionOverrides.effect,
      })
      .from(users)
      .innerJoin(roles, eq(roles.id, users.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(
        userPermissionOverrides,
        and(
          eq(userPermissionOverrides.userId, users.id),
          eq(userPermissionOverrides.permissionId, rolePermissions.permissionId),
          or(
            isNull(userPermissionOverrides.expiresAt),
            gt(userPermissionOverrides.expiresAt, sql`now()`),
          ),
        ),
      )
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)));

    const first = rows[0];
    if (!first) return null;

    const granted = new Set<string>();
    for (const row of rows) {
      if (!row.permissionCode) continue;
      if (row.effect === 'revoke') continue;
      granted.add(row.permissionCode);
    }

    // Concesiones puntuales de permisos que el rol NO incluye: no aparecen en
    // la consulta anterior porque ésta parte de los permisos del rol.
    const extra = await this.database
      .select({ code: permissions.code })
      .from(userPermissionOverrides)
      .innerJoin(permissions, eq(permissions.id, userPermissionOverrides.permissionId))
      .where(
        and(
          eq(userPermissionOverrides.userId, userId),
          eq(userPermissionOverrides.effect, 'grant'),
          or(
            isNull(userPermissionOverrides.expiresAt),
            gt(userPermissionOverrides.expiresAt, sql`now()`),
          ),
        ),
      );

    for (const row of extra) granted.add(row.code);

    return {
      role: first.roleCode as RoleCode,
      permissions: [...granted] as Permission[],
    };
  }

  async forRole(role: RoleCode): Promise<readonly Permission[]> {
    const rows = await this.database
      .select({ code: permissions.code })
      .from(roles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(roles.code, role));

    return rows.map((row) => row.code as Permission);
  }
}
