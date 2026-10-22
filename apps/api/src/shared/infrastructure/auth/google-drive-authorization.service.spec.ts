import { describe, expect, it, vi } from 'vitest';
import type { GoogleDriveConnectionRepository } from '../../application/ports/google-drive-connection.repository';
import type { GoogleOAuthClient } from '../../application/ports/google-oauth-client.port';
import { GoogleDriveAuthorizationService } from './google-drive-authorization.service';
import type { GoogleOAuthTokenCipher } from './google-oauth-token-cipher';

describe('GoogleDriveAuthorizationService', () => {
  it('vincula Drive solo cuando el correo Google coincide con Kora', async () => {
    let savedEmail: string | null = null;
    const google: GoogleOAuthClient = {
      buildAuthorizationUrl: () => '',
      fetchProfile: async () => ({
        email: 'carlo@kabeli.cl',
        emailVerified: true,
      }),
      buildDriveAuthorizationUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
      exchangeDriveAuthorizationCode: async () => ({
        profile: {
          email: 'carlo@kabeli.cl',
          emailVerified: true,
        },
        refreshToken: 'refresh-token',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      }),
      refreshAccessToken: async () => 'access-token',
    };
    const connections: GoogleDriveConnectionRepository = {
      findByUserId: async () => null,
      upsert: async (input) => {
        savedEmail = input.googleEmail;
      },
      deleteByUserId: async () => undefined,
    };
    const cipher = {
      encrypt: (value: string) => `encrypted:${value}`,
      decrypt: (value: string) => value.replace('encrypted:', ''),
    } as unknown as GoogleOAuthTokenCipher;

    const service = new GoogleDriveAuthorizationService(
      google,
      connections,
      cipher,
    );

    await service.completeAuthorization({
      userId: 'user-1',
      expectedEmail: 'Carlo@Kabeli.cl',
      code: 'code',
    });

    expect(savedEmail).toBe('carlo@kabeli.cl');
  });

  it('rechaza una cuenta Google distinta a la identidad Kora', async () => {
    const google: GoogleOAuthClient = {
      buildAuthorizationUrl: () => '',
      fetchProfile: async () => ({
        email: 'otro@kabeli.cl',
        emailVerified: true,
      }),
      buildDriveAuthorizationUrl: () => '',
      exchangeDriveAuthorizationCode: async () => ({
        profile: {
          email: 'otro@kabeli.cl',
          emailVerified: true,
        },
        refreshToken: 'refresh-token',
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
      }),
      refreshAccessToken: async () => 'access-token',
    };
    const upsert = vi.fn();
    const connections: GoogleDriveConnectionRepository = {
      findByUserId: async () => null,
      upsert,
      deleteByUserId: async () => undefined,
    };
    const cipher = {
      encrypt: (value: string) => value,
      decrypt: (value: string) => value,
    } as unknown as GoogleOAuthTokenCipher;

    const service = new GoogleDriveAuthorizationService(
      google,
      connections,
      cipher,
    );

    await expect(
      service.completeAuthorization({
        userId: 'user-1',
        expectedEmail: 'carlo@kabeli.cl',
        code: 'code',
      }),
    ).rejects.toThrow('mismo correo');

    expect(upsert).not.toHaveBeenCalled();
  });

  it('renueva y cachea el access token delegado', async () => {
    const refreshAccessToken = vi.fn(async () => 'access-token');
    const google: GoogleOAuthClient = {
      buildAuthorizationUrl: () => '',
      fetchProfile: async () => ({
        email: 'carlo@kabeli.cl',
        emailVerified: true,
      }),
      buildDriveAuthorizationUrl: () => '',
      exchangeDriveAuthorizationCode: async () => {
        throw new Error('not used');
      },
      refreshAccessToken,
    };
    const connections: GoogleDriveConnectionRepository = {
      findByUserId: async () => ({
        userId: 'user-1',
        googleEmail: 'carlo@kabeli.cl',
        refreshTokenEncrypted: 'encrypted:refresh-token',
        scopes: 'https://www.googleapis.com/auth/drive.readonly',
        connectedAt: new Date('2026-10-21T12:00:00.000Z'),
        updatedAt: new Date('2026-10-21T12:00:00.000Z'),
      }),
      upsert: async () => undefined,
      deleteByUserId: async () => undefined,
    };
    const cipher = {
      encrypt: (value: string) => `encrypted:${value}`,
      decrypt: (value: string) => value.replace('encrypted:', ''),
    } as unknown as GoogleOAuthTokenCipher;

    const service = new GoogleDriveAuthorizationService(
      google,
      connections,
      cipher,
    );

    expect(await service.getAccessToken('user-1')).toBe('access-token');
    expect(await service.getAccessToken('user-1')).toBe('access-token');
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
  });
});
