import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthorizedError } from '@kora/core';
import { AUTH_ERROR_CODES, type Permission, type RoleCode } from '@kora/contracts';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../decorators/current-user.decorator';
import {
  ACCESS_TOKEN_SERVICE,
  type AccessTokenService,
} from '../../application/ports/token.port';

/**
 * Autenticación global por bearer token.
 *
 * Se registra como guard global en `main.ts`, de modo que toda ruta nace
 * protegida y hay que abrirla a mano con `@Public()`. El guard NO consulta la
 * base de datos: verifica la firma del token y confía en sus claims, que el
 * caso de uso de login construyó. Eso mantiene el coste de autorizar en
 * microsegundos y sin carga sobre Postgres.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_SERVICE) private readonly tokens: AccessTokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedError(
        'Falta el token de acceso.',
        AUTH_ERROR_CODES.MISSING_ACCESS_TOKEN,
      );
    }

    const claims = await this.tokens.verify(token);
    if (!claims) {
      throw new UnauthorizedError(
        'El token de acceso es inválido o expiró.',
        AUTH_ERROR_CODES.INVALID_ACCESS_TOKEN,
      );
    }

    request.user = {
      id: claims.sub,
      email: claims.email,
      role: claims.role as RoleCode,
      permissions: claims.permissions as readonly Permission[],
      sessionId: claims.sid,
    };

    return true;
  }
}

export function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!value || scheme?.toLowerCase() !== 'bearer') return null;
  return value.trim() || null;
}
