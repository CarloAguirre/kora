import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import type {
  GoogleDriveGrant,
  GoogleOAuthClient,
  GoogleProfile,
} from '../../application/ports/google-oauth-client.port';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';
const DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly';

interface GoogleTokenResponse {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly scope?: string;
}

interface GoogleUserInfoResponse {
  readonly email?: string;
  readonly email_verified?: boolean;
}

/**
 * Adaptador del flujo OAuth "authorization code" de Google.
 *
 * El login básico solicita openid/email/profile. Drive se pide de forma
 * incremental cuando el usuario usa la Calculadora y siempre en nombre de esa
 * cuenta Google, no mediante una identidad global del backend.
 */
@Injectable()
export class GoogleOAuthClientService implements GoogleOAuthClient {
  constructor(private readonly config: AppConfigService) {}

  buildAuthorizationUrl(state: string): string {
    return this.buildAuthorizationUrlForScopes({
      state,
      scopes: ['openid', 'email', 'profile'],
      prompt: 'select_account',
    });
  }

  buildDriveAuthorizationUrl(
    state: string,
    loginHint: string,
  ): string {
    return this.buildAuthorizationUrlForScopes({
      state,
      scopes: ['openid', 'email', 'profile', DRIVE_READONLY_SCOPE],
      prompt: 'consent',
      loginHint,
      accessType: 'offline',
      includeGrantedScopes: true,
    });
  }

  async fetchProfile(code: string): Promise<GoogleProfile> {
    const token = await this.exchangeCode(code);
    if (!token.access_token) {
      throw new Error('Google no devolvió un access_token.');
    }

    return this.fetchProfileWithAccessToken(token.access_token);
  }

  async exchangeDriveAuthorizationCode(
    code: string,
  ): Promise<GoogleDriveGrant> {
    const token = await this.exchangeCode(code);

    if (!token.access_token) {
      throw new Error('Google no devolvió un access_token para Drive.');
    }
    if (!token.refresh_token) {
      throw new Error(
        'Google no devolvió refresh_token. Vuelve a autorizar Drive para conceder acceso offline.',
      );
    }

    const profile = await this.fetchProfileWithAccessToken(
      token.access_token,
    );

    return {
      profile,
      refreshToken: token.refresh_token,
      scopes: (token.scope ?? '')
        .split(/\s+/)
        .filter(Boolean),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<string> {
    const { clientId, clientSecret } = this.config.google;
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Google rechazó la renovación de Drive (HTTP ${response.status}).`,
      );
    }

    const token = (await response.json()) as GoogleTokenResponse;
    if (!token.access_token) {
      throw new Error(
        'Google no devolvió access_token al renovar Drive.',
      );
    }

    return token.access_token;
  }

  private buildAuthorizationUrlForScopes(input: {
    readonly state: string;
    readonly scopes: readonly string[];
    readonly prompt: 'select_account' | 'consent';
    readonly loginHint?: string;
    readonly accessType?: 'offline';
    readonly includeGrantedScopes?: boolean;
  }): string {
    const { clientId, callbackUrl } = this.config.google;

    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', input.scopes.join(' '));
    url.searchParams.set('state', input.state);
    url.searchParams.set('prompt', input.prompt);

    if (input.loginHint) {
      url.searchParams.set('login_hint', input.loginHint);
    }
    if (input.accessType) {
      url.searchParams.set('access_type', input.accessType);
    }
    if (input.includeGrantedScopes) {
      url.searchParams.set('include_granted_scopes', 'true');
    }

    return url.toString();
  }

  private async exchangeCode(
    code: string,
  ): Promise<GoogleTokenResponse> {
    const { clientId, clientSecret, callbackUrl } = this.config.google;

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(
        `Google rechazó el intercambio de código (HTTP ${tokenResponse.status}).`,
      );
    }

    return (await tokenResponse.json()) as GoogleTokenResponse;
  }

  private async fetchProfileWithAccessToken(
    accessToken: string,
  ): Promise<GoogleProfile> {
    const profileResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileResponse.ok) {
      throw new Error(
        `Google rechazó la consulta de perfil (HTTP ${profileResponse.status}).`,
      );
    }

    const profile =
      (await profileResponse.json()) as GoogleUserInfoResponse;
    if (!profile.email) {
      throw new Error('El perfil de Google no incluyó un correo.');
    }

    return {
      email: profile.email,
      emailVerified: profile.email_verified === true,
    };
  }
}
