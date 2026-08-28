import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { Permission, RoleCode } from '@kora/contracts';

/** Identidad ya verificada que el guard deja en la petición. */
export interface RequestUser {
  readonly id: string;
  readonly email: string;
  readonly role: RoleCode;
  readonly permissions: readonly Permission[];
  readonly sessionId: string;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user?: RequestUser;
}

/** Inyecta el usuario autenticado en el parámetro del controlador. */
export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, context: ExecutionContext): unknown => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
