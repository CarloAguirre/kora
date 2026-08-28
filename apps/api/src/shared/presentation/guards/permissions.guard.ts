import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError } from '@kora/core';
import type { Permission } from '@kora/contracts';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';

/**
 * Autorización por permiso.
 *
 * Corre después de `JwtAuthGuard`, así que puede dar por hecho que hay
 * identidad. Exige que el usuario tenga TODOS los permisos declarados en el
 * endpoint: es más fácil razonar sobre una conjunción que sobre reglas mixtas,
 * y para los casos "cualquiera de estos" basta con declarar el permiso más
 * amplio en el endpoint y afinar dentro del caso de uso.
 *
 * Lo que este guard NO decide es el alcance de los datos ("solo su equipo"):
 * eso es una regla de negocio y vive en el caso de uso, donde se puede probar.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const anyOf = this.reflector.getAllAndOverride<Permission[] | undefined>(ANY_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if ((!required || required.length === 0) && (!anyOf || anyOf.length === 0)) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const granted = new Set(request.user?.permissions ?? []);

    if (required && required.length > 0) {
      const missing = required.filter((permission) => !granted.has(permission));
      if (missing.length > 0) {
        throw new ForbiddenError('No tienes permiso para realizar esta acción.', 'MISSING_PERMISSION', {
          details: { missing },
        });
      }
    }

    if (anyOf && anyOf.length > 0 && !anyOf.some((permission) => granted.has(permission))) {
      throw new ForbiddenError('No tienes permiso para realizar esta acción.', 'MISSING_PERMISSION', {
        details: { missing: anyOf },
      });
    }

    return true;
  }
}
