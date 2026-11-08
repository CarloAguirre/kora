import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRIVE_DISCOVERY_SESSION, GoogleDriveOAuthPocService } from './google-drive-oauth-poc.service';

afterEach(() => vi.unstubAllGlobals());

describe('GoogleDriveOAuthPocService · descubrimiento sin URL', () => {
  it('no busca una carpeta ficticia, almacena el token efímero del usuario y solo expone conteo', async () => {
    const config = {
      googleDriveOauthPocEnabled: true,
      google: { enabled: true, clientId: 'client-test', clientSecret: 'secret-test',
        callbackUrl: 'https://kora.example/auth/google/callback' },
    } as never;
    const service = new GoogleDriveOAuthPocService(config);
    const { state, authorizationUrl } = service.start('usuario-1', DRIVE_DISCOVERY_SESSION);
    expect(authorizationUrl).toContain('drive.readonly');
    const responses = [
      new Response(JSON.stringify({ access_token: 'secreto-de-google',
        scope: 'https://www.googleapis.com/auth/drive.readonly', expires_in: 3600 }), { status: 200 }),
      new Response(JSON.stringify({ files: [{ id: 'folder-real', name: 'Levantamiento' }] }), { status: 200 }),
    ];
    const mockFetch = vi.fn().mockImplementation(async () => responses.shift());
    vi.stubGlobal('fetch', mockFetch);
    const result = await service.finish({ state, stateCookie: state, code: 'auth-code' });
    expect(result).toMatchObject({ status: 'ok', code: 'DRIVE_DISCOVERY_READY', filesInSample: 1 });
    expect(service.getAuthorizedAccessToken('usuario-1', DRIVE_DISCOVERY_SESSION))
      .toBe('secreto-de-google');
    expect(service.getAuthorizedAccessToken('usuario-2', DRIVE_DISCOVERY_SESSION))
      .toBeNull();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const requestedUrl = String(mockFetch.mock.calls[1]![0]);
    expect(requestedUrl).toContain('mimeType');
    expect(requestedUrl).not.toContain(DRIVE_DISCOVERY_SESSION);
    expect(JSON.stringify(result)).not.toContain('secreto-de-google');
  });
});
