import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSIONS,
  ROLE_CODES,
  ROLE_LABELS,
  isAdminTier,
  type Permission,
  type RoleCode,
} from '@kora/contracts';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../client';
import { permissions, rolePermissions, roles } from '../schema';

/**
 * Siembra el catálogo de acceso (roles, permisos y su relación).
 *
 * Es idempotente y convergente: se puede ejecutar en cada despliegue. Si en el
 * contrato aparece un permiso nuevo, se crea; si un rol deja de tener un
 * permiso, se le quita. El código de `@kora/contracts` es la fuente de verdad;
 * la base es su proyección.
 */

export interface SeedAccessCatalogResult {
  rolesCreated: number;
  permissionsCreated: number;
  grantsAdded: number;
  grantsRemoved: number;
}

const ROLE_DESCRIPTIONS: Record<RoleCode, string> = {
  admin: 'Acceso total al sistema, incluida la eliminación de usuarios.',
  pmo: 'Equivalente a administrador para la operación; no elimina usuarios.',
  leader: 'Gestiona sus equipos y proyectos, y aprueba las horas de su gente.',
  collaborator: 'Registra sus horas y trabaja los tickets que se le asignan.',
  commercial: 'Consulta los clientes y tickets de su cartera comercial.',
};

export async function seedAccessCatalog(db: Database): Promise<SeedAccessCatalogResult> {
  const result: SeedAccessCatalogResult = {
    rolesCreated: 0,
    permissionsCreated: 0,
    grantsAdded: 0,
    grantsRemoved: 0,
  };

  // 1. Permisos —————————————————————————————————————————————————
  const permissionRows = PERMISSIONS.map((code) => {
    const [resource = code, action = 'read'] = code.split(':');
    return { code, resource, action, description: null };
  });

  const insertedPermissions = await db
    .insert(permissions)
    .values(permissionRows)
    .onConflictDoNothing({ target: permissions.code })
    .returning({ id: permissions.id });
  result.permissionsCreated = insertedPermissions.length;

  const allPermissions = await db
    .select({ id: permissions.id, code: permissions.code })
    .from(permissions);
  const permissionIdByCode = new Map(allPermissions.map((row) => [row.code, row.id]));

  // 2. Roles ——————————————————————————————————————————————————
  const roleRows = ROLE_CODES.map((code, index) => ({
    code,
    name: ROLE_LABELS[code],
    description: ROLE_DESCRIPTIONS[code],
    isAdminTier: isAdminTier(code),
    isSystem: true,
    displayOrder: index,
  }));

  const insertedRoles = await db
    .insert(roles)
    .values(roleRows)
    .onConflictDoNothing({ target: roles.code })
    .returning({ id: roles.id });
  result.rolesCreated = insertedRoles.length;

  const allRoles = await db.select({ id: roles.id, code: roles.code }).from(roles);
  const roleIdByCode = new Map(allRoles.map((row) => [row.code, row.id]));

  // 3. Concesiones rol → permiso ————————————————————————————————
  for (const roleCode of ROLE_CODES) {
    const roleId = roleIdByCode.get(roleCode);
    if (!roleId) continue;

    const expected = new Set<Permission>(DEFAULT_ROLE_PERMISSIONS[roleCode]);

    const current = await db
      .select({ permissionId: rolePermissions.permissionId, code: permissions.code })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));

    const currentCodes = new Set(current.map((row) => row.code));

    const toAdd = [...expected]
      .filter((code) => !currentCodes.has(code))
      .map((code) => permissionIdByCode.get(code))
      .filter((id): id is string => Boolean(id));

    if (toAdd.length > 0) {
      await db
        .insert(rolePermissions)
        .values(toAdd.map((permissionId) => ({ roleId, permissionId })))
        .onConflictDoNothing();
      result.grantsAdded += toAdd.length;
    }

    const toRemove = current
      .filter((row) => !expected.has(row.code as Permission))
      .map((row) => row.permissionId);

    if (toRemove.length > 0) {
      await db
        .delete(rolePermissions)
        .where(
          and(
            eq(rolePermissions.roleId, roleId),
            inArray(rolePermissions.permissionId, toRemove),
          ),
        );
      result.grantsRemoved += toRemove.length;
    }
  }

  return result;
}
