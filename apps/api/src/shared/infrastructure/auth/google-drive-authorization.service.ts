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

export interface GoogleDriveConnectionStatus {
  readonly connected: boolean;
  readonly email: string | null;
  readonly scopes: readonly string[];
}

@Injectable()
export class GoogleDriveAuthorizationService {
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

    await this.connections.upsert({
      userId: input.userId,
      googleEmail: grant.profile.email,
      refreshTokenEncrypted: this.cipher.encrypt(grant.refreshToken),
      scopes: grant.scopes.join(' '),
    });
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
    const connection = await this.connections.findByUserId(userId);
    if (!connection) {
      throw new Error(
        'Conecta Google Drive con tu cuenta antes de consultar esta carpeta.',
      );
    }

    const refreshToken = this.cipher.decrypt(
      connection.refreshTokenEncrypted,
    );

    return this.google.refreshAccessToken(refreshToken);
  }

  async disconnect(userId: string): Promise<void> {
    await this.connections.deleteByUserId(userId);
  }
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}
