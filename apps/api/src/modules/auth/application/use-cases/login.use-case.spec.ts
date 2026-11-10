import { describe, expect, it, vi } from 'vitest';
import { AUTH_ERROR_CODES } from '@kora/contracts';
import { LoginUseCase } from './login.use-case';
import { GoogleLoginUseCase } from './google-login.use-case';

const external = 'cliente@correo-externo.example';
const actor = {
  id: '65b597f1-5409-4fd4-9450-0d24495b5b63',
  role: 'cliente',
  isDeleted: false,
  canSignIn: true,
  status: 'active',
  email: { value: external },
};

const command = {
  credentials: { email: external, password: 'ContraseñaSegura123' },
  ipAddress: null,
  userAgent: null,
  requestId: null,
};

function setupPassword() {
  const users = { findByEmail: vi.fn().mockResolvedValue(actor) };
  const credentials = {
    findByUserId: vi.fn().mockResolvedValue({
      passwordHash: 'hash', passwordAlgorithm: 'argon2id',
      lockedUntil: null, mustChangePassword: false,
    }),
    registerFailedAttempt: vi.fn().mockResolvedValue(1),
    registerSuccessfulLogin: vi.fn().mockResolvedValue(undefined),
  };
  const hasher = {
    verify: vi.fn().mockResolvedValue({ valid: true, needsRehash: false }),
  };
  const portal = { isEnabled: vi.fn().mockResolvedValue(false) };
  const issuer = { issue: vi.fn().mockResolvedValue({ sessionId: 'session' }) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const config = { auth: { allowedEmailDomains: ['kabeli.cl'], maxFailedAttempts: 5, lockMinutes: 15 } };
  const useCase = new LoginUseCase(
    users as never, credentials as never, hasher as never, audit as never,
    { now: () => new Date('2026-11-10T18:00:00Z') } as never,
    issuer as never, config as never, portal as never,
  );
  return { useCase, users, credentials, hasher, portal, issuer };
}

describe('Login del portal externo', () => {
  it('explica que falta vincular el cliente solo después de validar la contraseña', async () => {
    const { useCase, hasher, portal, issuer } = setupPassword();
    const result = await useCase.execute(command);
    expect(result.isErr()).toBe(true);
    if (!result.isErr()) return;
    expect(result.error.code).toBe(AUTH_ERROR_CODES.CLIENT_PORTAL_NOT_ENABLED);
    expect(result.error.message).toMatch(/ficha de tu empresa/);
    expect(hasher.verify).toHaveBeenCalledOnce();
    expect(portal.isEnabled).toHaveBeenCalledWith(actor.id, external);
    expect(issuer.issue).not.toHaveBeenCalled();
  });

  it('no revela el estado del vínculo del portal a quien usa una contraseña errónea', async () => {
    const { useCase, hasher, portal } = setupPassword();
    hasher.verify.mockResolvedValue({ valid: false, needsRehash: false });
    const result = await useCase.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe(AUTH_ERROR_CODES.INVALID_CREDENTIALS);
    expect(portal.isEnabled).not.toHaveBeenCalled();
  });

  it('permite clientes de dominio externo solo con vínculo habilitado', async () => {
    const { useCase, portal, issuer } = setupPassword();
    portal.isEnabled.mockResolvedValue(true);
    const result = await useCase.execute(command);
    expect(result.isOk()).toBe(true);
    expect(issuer.issue).toHaveBeenCalledOnce();
  });

  it('mantiene la restricción de dominio para los usuarios internos', async () => {
    const { useCase, users, hasher, portal } = setupPassword();
    users.findByEmail.mockResolvedValue({ ...actor, role: 'leader' });
    const result = await useCase.execute(command);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe(AUTH_ERROR_CODES.EMAIL_DOMAIN_NOT_ALLOWED);
    expect(hasher.verify).not.toHaveBeenCalled();
    expect(portal.isEnabled).not.toHaveBeenCalled();
  });
});

describe('Google OAuth del portal externo', () => {
  it('distingue el correo Google verificado del permiso de portal faltante', async () => {
    const users = { findByEmail: vi.fn().mockResolvedValue(actor) };
    const google = { fetchProfile: vi.fn().mockResolvedValue({ email: external, emailVerified: true }) };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const issuer = { issue: vi.fn() };
    const portal = { isEnabled: vi.fn().mockResolvedValue(false) };
    const useCase = new GoogleLoginUseCase(
      users as never, google as never, audit as never, issuer as never,
      { auth: { allowedEmailDomains: ['kabeli.cl'] } } as never,
      portal as never,
    );
    const result = await useCase.execute({ code: 'oauth-code', ipAddress: null, userAgent: null, requestId: null });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe(AUTH_ERROR_CODES.CLIENT_PORTAL_NOT_ENABLED);
    expect(portal.isEnabled).toHaveBeenCalledWith(actor.id, external);
    expect(issuer.issue).not.toHaveBeenCalled();
  });
});
