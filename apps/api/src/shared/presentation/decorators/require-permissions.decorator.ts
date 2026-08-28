import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@kora/contracts';

export const PERMISSIONS_KEY = 'kora:permissions';
export const ANY_PERMISSIONS_KEY = 'kora:any-permissions';

/**
 * Declara qué permisos exige un endpoint. Se exigen TODOS los indicados.
 *
 * La autorización se expresa siempre en permisos, nunca en roles: así, añadir
 * un rol nuevo o mover una capacidad de un rol a otro no obliga a tocar ni un
 * controlador. Es el punto donde la v1 se rompía — `role === 'administrador'`
 * repartido por decenas de archivos, que hubo que parchear con
 * `isAdminLikeRole()` cuando apareció PMO.
 */
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Variante "cualquiera de estos" — para endpoints donde el permiso completo
 * (p.ej. `projects:read`) y el acotado (`projects:read_assigned`) dan acceso
 * al mismo endpoint, y es el caso de uso el que decide el alcance real de los
 * datos según cuál de los dos tenga el actor.
 */
export const RequireAnyPermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ANY_PERMISSIONS_KEY, permissions);
