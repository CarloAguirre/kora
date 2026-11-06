import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleDriveOAuthPocService, renderDriveOAuthPocResult } from './google-drive-oauth-poc.service';

const config = {
  googleDriveOauthPocEnabled: true,
  google: {
    enabled: true,
    clientId: 'kora-web-client',
    clientSecret: 'fake-secret-for-test',
    callbackUrl: 'https://kora.test/api/auth/google/callback',
  },
} as const;

function setup() {
  return new GoogleDriveOAuthPocService(config as never);
}

afterEach(() => vi.unstubAllGlobals());

describe('GoogleDriveOAuthPocService — diagnóstico temporal seguro', () => {
  it('utiliza el callback existente y scope de lectura, sin pedir refresh token', () => {
    const service = setup();
    const { state, authorizationUrl } = service.start('actor-1', 'realFolder123');
    const uri = new URL(authorizationUrl);
    expect(uri.origin).toBe('https://accounts.google.com');
    expect(uri.searchParams.get('redirect_uri')).toBe(config.google.callbackUrl);
    expect(uri.searchParams.get('client_id')).toBe(config.google.clientId);
    expect(uri.searchParams.get('state')).toBe(state);
    expect(uri.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/drive.readonly');
    expect(uri.searchParams.get('access_type')).toBe('online');
    expect(uri.searchParams.get('prompt')).toContain('consent');
    expect(state).toMatch(/^kora-drive-poc-[a-f0-9]{64}$/);
  });

  it('no canjea un código si faltan cookies correctas y consume el state una sola vez', async () => {
    const service = setup();
    const { state } = service.start('actor-1', 'realFolder123');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await service.finish({ state, stateCookie: 'otro-state', code: 'secret' })).code)
      .toBe('STATE_EXPIRED');
    expect((await service.finish({ state, stateCookie: state, code: 'secret' })).code)
      .toBe('STATE_EXPIRED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rechaza consentimiento denegado sin llamar a Google API', async () => {
    const service = setup();
    const { state } = service.start('actor-1', 'realFolder123');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.finish({ state, stateCookie: state, error: 'access_denied' });
    expect(result.code).toBe('GOOGLE_CONSENT_DENIED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifica Drive y conserva un token de corta vida solo para el usuario y la carpeta autorizados', async () => {
    const service = setup();
    const { state } = service.start('actor-1', 'realFolder123');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'google-temporary-access',
        scope: 'openid email profile https://www.googleapis.com/auth/drive.readonly',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'realFolder123', name: 'Antecedentes', mimeType: 'application/vnd.google-apps.folder',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        files: [{ id: 'doc-1', name: 'ERS.pdf' }, { id: 'doc-2', name: 'HU.doc' }],
      }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.finish({ state, stateCookie: state, code: 'google-code' });
    expect(result).toEqual({
      status: 'ok', code: 'DRIVE_READ_SUCCESS',
      message: expect.any(String), filesInSample: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const url = String(fetchMock.mock.calls[2]?.[0]);
    expect(new URL(url).searchParams.get('q')).toContain('realFolder123');
    expect(JSON.stringify(result)).not.toContain('google-temporary-access');
    expect(service.getAuthorizedAccessToken('actor-1', 'realFolder123')).toBe('google-temporary-access');
    expect(service.getAuthorizedAccessToken('actor-2', 'realFolder123')).toBeNull();
    expect(service.getAuthorizedAccessToken('actor-1', 'otra-carpeta')).toBeNull();
    expect((await service.finish({ state, stateCookie: state, code: 'replayed' })).code)
      .toBe('STATE_EXPIRED');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('no confunde un 403 de Google con una carpeta válida ni lo registra como éxito', async () => {
    const service = setup();
    const { state } = service.start('actor-1', 'realFolder123');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'temporary',
        scope: 'https://www.googleapis.com/auth/drive.readonly',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.finish({ state, stateCookie: state, code: 'google-code' });
    expect(result).toEqual(expect.objectContaining({
      status: 'error', code: 'DRIVE_API_DISABLED_OR_FORBIDDEN',
    }));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(service.getAuthorizedAccessToken('actor-1', 'realFolder123')).toBeNull();
  });

  it('no informa éxito si Google solo concede scopes de identidad', async () => {
    const service = setup();
    const { state } = service.start('actor-1', 'realFolder123');
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      access_token: 'identity-only', scope: 'openid email profile',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await service.finish({ state, stateCookie: state, code: 'google-code' });
    expect(result.code).toBe('DRIVE_SCOPE_MISSING');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('su HTML no introduce nombres externos como scripts ni expone tokens', () => {
    const html = renderDriveOAuthPocResult({
      status: 'error', code: 'FAILED',
      message: '</script><script>alert(1)</script>',
    });
    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('postMessage');
    expect(html).not.toContain('refresh_token');
  });
});
