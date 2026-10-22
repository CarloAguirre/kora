import { Inject, Injectable } from '@nestjs/common';
import {
  GOOGLE_DRIVE_CONNECTION_REPOSITORY,
  type GoogleDriveConnectionRepository,
} from '../../application/ports/google-drive-connection.repository';
import {
  GOOGLE_OAUTH_CLIENT,
  type GoogleOAuthClient,
} from '../../application/ports/google-oauth-client.port';
import { GoogleOAuthTokenCipher } from './google-oauth-token-cipher';

const DRIVE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/drive.readonly';

export interface GoogleDriveConnectionStatus {
  readonly connected: boolean;
  readonly email: string | null;
  readonly scopes: readonly string[];
}

@Injectable()
export class GoogleDriveAuthorizationService {
  private readonly accessTokens = new Map<
    string,
    { readonly value: string; readonly expiresAtMs: number }
  >();

  constructor(
    @Inject(GOOGLE_OAUTH_CLIENT)
    private readonly google: GoogleOAuthClient,
    @Inject(GOOGLE_DRIVE_CONNECTION_REPOSITORY)
    private readonly connections: GoogleDriveConnectionRepository,
    private readonly cipher: GoogleOAuthTokenCipher,
  ) {}

  buildAuthorizationUrl(
    state: string,
    loginHint: string,
  ): string {
    return this.google.buildDriveAuthorizationUrl(state, loginHint);
  }

  async completeAuthorization(input: {
    readonly userId: string;
    readonly expectedEmail: string;
    readonly code: string;
  }): Promise<void> {
    const grant = await this.google.exchangeDriveAuthorizationCode(
      input.code,
    );

    if (!grant.profile.emailVerified) {
      throw new Error(
        'La cuenta Google utilizada para Drive no tiene el correo verificado.',
      );
    }

    if (
      normalizeEmail(grant.profile.email) !==
      normalizeEmail(input.expectedEmail)
    ) {
      throw new Error(
        'Debes autorizar Drive con el mismo correo asociado a tu usuario de Kora.',
      );
    }

    if (!grant.scopes.includes(DRIVE_READONLY_SCOPE)) {
      throw new Error(
        'No se concedió el permiso de lectura de Google Drive.',
      );
    }

    await this.connections.upsert({
      userId: input.userId,
      googleEmail: grant.profile.email,
      refreshTokenEncrypted: this.cipher.encrypt(grant.refreshToken),
      scopes: grant.scopes.join(' '),
    });
    this.accessTokens.delete(input.userId);
  }

  async status(
    userId: string,
  ): Promise<GoogleDriveConnectionStatus> {
    const connection = await this.connections.findByUserId(userId);

    return {
      connected: connection !== null,
      email: connection?.googleEmail ?? null,
      scopes: connection?.scopes.split(/\s+/).filter(Boolean) ?? [],
    };
  }

  async isConnected(userId: string): Promise<boolean> {
    return (await this.connections.findByUserId(userId)) !== null;
  }

  async getAccessToken(userId: string): Promise<string> {
    const cached = this.accessTokens.get(userId);
    if (cached && cached.expiresAtMs > Date.now() + 60_000) {
      return cached.value;
    }

    const connection = await this.connections.findByUserId(userId);
    if (!connection) {
      throw new Error(
        'Conecta Google Drive con tu cuenta antes de consultar esta carpeta.',
      );
    }

    const refreshToken = this.cipher.decrypt(
      connection.refreshTokenEncrypted,
    );

    const accessToken =
      await this.google.refreshAccessToken(refreshToken);

    this.accessTokens.set(userId, {
      value: accessToken,
      expiresAtMs: Date.now() + 50 * 60_000,
    });

    return accessToken;
  }

  async disconnect(userId: string): Promise<void> {
    this.accessTokens.delete(userId);
    await this.connections.deleteByUserId(userId);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
