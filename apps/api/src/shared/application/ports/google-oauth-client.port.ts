/**
 * Puerto de intercambio OAuth con Google.
 *
 * El dominio conoce únicamente las operaciones de autorización necesarias para
 * login y para consentimiento incremental de Drive. Los detalles HTTP quedan en
 * infraestructura.
 */

export interface GoogleProfile {
  readonly email: string;
  readonly emailVerified: boolean;
}

export interface GoogleDriveGrant {
  readonly profile: GoogleProfile;
  readonly refreshToken: string;
  readonly scopes: readonly string[];
}

export interface GoogleOAuthClient {
  buildAuthorizationUrl(state: string): string;
  fetchProfile(code: string): Promise<GoogleProfile>;

  buildDriveAuthorizationUrl(
    state: string,
    loginHint: string,
  ): string;
  exchangeDriveAuthorizationCode(
    code: string,
  ): Promise<GoogleDriveGrant>;
  refreshAccessToken(refreshToken: string): Promise<string>;
}

export const GOOGLE_OAUTH_CLIENT = Symbol('GoogleOAuthClient');
