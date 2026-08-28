import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../../config/app-config.service';
import type { GoogleOAuthClient, GoogleProfile } from '../../application/ports/google-oauth-client.port';

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

interface GoogleTokenResponse {
  readonly access_token?: string;
}

interface GoogleUserInfoResponse {
  readonly email?: string;
  readonly email_verified?: boolean;
}

/**
 * Adaptador del flujo "authorization code" de Google, con `fetch` nativo.
 *
 * No usamos `passport` ni una librería de OAuth: son dos llamadas HTTP —
 * canjear el código por un `access_token` y pedir el perfil con él— y traer
 * una dependencia entera para eso es más superficie que la que resuelve.
 */
@Injectable()
export class GoogleOAuthClientService implements GoogleOAuthClient {
  constructor(private readonly config: AppConfigService) {}

  buildAuthorizationUrl(state: string): string {
    const { clientId, callbackUrl } = this.config.google;

    const url = new URL(AUTHORIZATION_ENDPOINT);
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'select_account');

    return url.toString();
  }

  async fetchProfile(code: string): Promise<GoogleProfile> {
    const { clientId, clientSecret, callbackUrl } = this.config.google;

    const tokenResponse = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Google rechazó el intercambio de código (HTTP ${tokenResponse.status}).`);
    }

    const tokenBody = (await tokenResponse.json()) as GoogleTokenResponse;
    if (!tokenBody.access_token) {
      throw new Error('Google no devolvió un access_token.');
    }

    const profileResponse = await fetch(USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });

    if (!profileResponse.ok) {
      throw new Error(`Google rechazó la consulta de perfil (HTTP ${profileResponse.status}).`);
    }

    const profile = (await profileResponse.json()) as GoogleUserInfoResponse;
    if (!profile.email) {
      throw new Error('El perfil de Google no incluyó un correo.');
    }

    return { email: profile.email, emailVerified: profile.email_verified === true };
  }
}
