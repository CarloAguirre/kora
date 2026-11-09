import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

function setup() {
  const driveOAuthPoc = { finish: vi.fn().mockResolvedValue({
    status: 'ok', code: 'DRIVE_READ_SUCCESS', message: 'Lectura completada', filesInSample: 2,
  }) };
  const googleLogin = { execute: vi.fn().mockResolvedValue({
    isErr: () => true, error: { code: 'GOOGLE_LOGIN_FAILED' },
  }) };
  const controller = Object.assign(Object.create(AuthController.prototype), {
    driveOAuthPoc, googleLogin, config: { isProduction: false },
  }) as AuthController;
  const reply = {
    clearCookie: vi.fn(), redirect: vi.fn(), header: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(), send: vi.fn(),
  };
  return { controller, driveOAuthPoc, googleLogin, reply };
}

describe('Callback OAuth compartido (login existente / PoC Drive)', () => {
  it('al reconocer state de Drive valida cookie separada y NO inicia sesión Google', async () => {
    const { controller, reply, googleLogin, driveOAuthPoc } = setup();
    await controller.googleCallback({
      query: { code: 'drive-code', state: 'kora-drive-poc-abc' },
      cookies: { kora_drive_poc_state: 'kora-drive-poc-abc', kora_google_state: 'login-state' },
      headers: {},
    } as never, reply as never);
    expect(driveOAuthPoc.finish).toHaveBeenCalledWith({
      state: 'kora-drive-poc-abc', stateCookie: 'kora-drive-poc-abc',
      code: 'drive-code', error: undefined,
    });
    expect(googleLogin.execute).not.toHaveBeenCalled();
    expect(reply.clearCookie).toHaveBeenCalledWith('kora_drive_poc_state', { path: '/' });
    expect(reply.clearCookie).not.toHaveBeenCalledWith('kora_google_state', { path: '/' });
    expect(reply.send).toHaveBeenCalledWith(expect.stringContaining('Conexión con Drive completada'));
    expect(reply.redirect).not.toHaveBeenCalled();
  });

  it('sigue utilizando el login original cuando el state no es Drive', async () => {
    const { controller, reply, googleLogin, driveOAuthPoc } = setup();
    await controller.googleCallback({
      query: { code: 'login-code', state: 'login-state' },
      cookies: { kora_google_state: 'login-state' },
      headers: {}, id: 'request-1', ip: '127.0.0.1',
    } as never, reply as never);
    expect(driveOAuthPoc.finish).not.toHaveBeenCalled();
    expect(googleLogin.execute).toHaveBeenCalledOnce();
    expect(reply.clearCookie).toHaveBeenCalledWith('kora_google_state', { path: '/' });
    expect(reply.redirect).toHaveBeenCalledWith('/login?google_error=GOOGLE_LOGIN_FAILED', 302);
  });
});
