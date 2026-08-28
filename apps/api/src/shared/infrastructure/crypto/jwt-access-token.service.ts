import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../../config/app-config.service';
import type {
  AccessTokenClaims,
  AccessTokenService,
  SignedAccessToken,
} from '../../application/ports/token.port';

/**
 * Access token JWT de vida corta.
 *
 * Lleva los permisos ya resueltos dentro del token, así que autorizar una
 * petición no requiere consultar la base: el guard decide con lo que trae el
 * token. El precio es que un cambio de permisos tarda como mucho un TTL en
 * propagarse; con 15 minutos por defecto es un compromiso razonable, y las
 * revocaciones urgentes (bloqueo de cuenta) se aplican de inmediato porque
 * invalidan la sesión y el refresh deja de funcionar.
 */
@Injectable()
export class JwtAccessTokenService implements AccessTokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async sign(claims: AccessTokenClaims): Promise<SignedAccessToken> {
    const expiresInSeconds = this.config.auth.accessTtlSeconds;

    const token = await this.jwt.signAsync(
      {
        sub: claims.sub,
        email: claims.email,
        role: claims.role,
        permissions: claims.permissions,
        sid: claims.sid,
      },
      {
        secret: this.config.auth.accessSecret,
        expiresIn: expiresInSeconds,
        issuer: 'kora',
        audience: 'kora-api',
      },
    );

    return { token, expiresInSeconds };
  }

  async verify(token: string): Promise<AccessTokenClaims | null> {
    try {
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(token, {
        secret: this.config.auth.accessSecret,
        issuer: 'kora',
        audience: 'kora-api',
      });

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.email !== 'string' ||
        typeof payload.role !== 'string' ||
        typeof payload.sid !== 'string' ||
        !Array.isArray(payload.permissions)
      ) {
        return null;
      }

      return {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        sid: payload.sid,
        permissions: payload.permissions.filter((item): item is string => typeof item === 'string'),
      };
    } catch {
      // Token expirado, firma inválida o malformado: para el llamador es lo
      // mismo — no hay identidad probada.
      return null;
    }
  }
}
