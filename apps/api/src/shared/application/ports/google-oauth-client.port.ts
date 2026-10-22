/**
 * Puerto de intercambio OAuth con Google.
 *
 * El dominio solo conoce "dame la URL de autorización" y "dado un código,
 * dime qué correo es". Cómo se llega ahí (los dos viajes HTTP contra Google)
 * es infraestructura, igual que `token.port.ts` no sabe que detrás hay JWT.
 */

export interface GoogleProfile {
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface GoogleOAuthClient {
  buildAuthorizationUrl(state: string): string;
  fetchProfile(code: string): Promise<GoogleProfile>;
}

export const GOOGLE_OAUTH_CLIENT = Symbol('GoogleOAuthClient');
