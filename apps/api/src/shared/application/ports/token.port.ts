/** Puertos de emisión y verificación de tokens. */

export interface AccessTokenClaims {
  /** Identificador del usuario. */
  readonly sub: string;
  readonly email: string;
  readonly role: string;
  readonly permissions: readonly string[];
  /** Identificador de la sesión que respalda este access token. */
  readonly sid: string;
}

export interface SignedAccessToken {
  readonly token: string;
  readonly expiresInSeconds: number;
}

export interface AccessTokenService {
  sign(claims: AccessTokenClaims): Promise<SignedAccessToken>;
  verify(token: string): Promise<AccessTokenClaims | null>;
}

/**
 * Generador de secretos opacos (refresh tokens, tokens de recuperación).
 * Devuelve el valor en claro —que solo ve el titular— y su hash, que es lo
 * único que se guarda.
 */
export interface OpaqueTokenGenerator {
  generate(): { readonly value: string; readonly hash: string };
  hash(value: string): string;
}

export const ACCESS_TOKEN_SERVICE = Symbol('AccessTokenService');
export const OPAQUE_TOKEN_GENERATOR = Symbol('OpaqueTokenGenerator');
