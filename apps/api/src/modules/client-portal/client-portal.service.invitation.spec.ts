import { describe, expect, it, vi } from 'vitest';
import { ok } from '@kora/core';
import type { Database } from '@kora/db';
import type { UserCredentialRepository } from '../users/domain/repositories/user-credential.repository';
import type { CreateUserUseCase } from '../users/application/use-cases/create-user.use-case';
import type { GrantUserAccessUseCase } from '../users/application/use-cases/grant-user-access.use-case';
import type { GetProjectUseCase } from '../projects/application/use-cases/get-project.use-case';
import type { GetSupportPlanUseCase } from '../tickets/application/use-cases/get-support-plan.use-case';
import { ClientPortalService } from './client-portal.service';

const CONTACT_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function scenario({
  accountExists = true,
  hasPassword = false,
  invitationSent = true,
}: {
  accountExists?: boolean;
  hasPassword?: boolean;
  invitationSent?: boolean;
} = {}) {
  const contact = {
    id: CONTACT_ID, clientId: CLIENT_ID,
    name: 'Germán Abarca', email: 'german@abarcamotores.cl',
  };
  const queries: unknown[][] = [
    [contact],
    accountExists ? [{ id: USER_ID, email: contact.email, role: 'cliente' }] : [],
    ...(accountExists ? [[{ clientId: CLIENT_ID, contactId: CONTACT_ID }]] : []),
  ];
  // Drizzle chain stub: each select ends with a limit(1) in this use case.
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: vi.fn(async () => queries.shift() ?? []),
  };
  const tx = {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(async () => undefined) })),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  };
  const database = {
    select: vi.fn(() => chain),
    transaction: vi.fn(async (callback: (t: typeof tx) => Promise<void>) => callback(tx)),
  } as unknown as Database;
  const createUser = {
    execute: vi.fn(async () => ok({
      userId: USER_ID, email: contact.email, invitationSent,
    })),
  };
  const grant = {
    execute: vi.fn(async () => ok({
      invitationSent, expiresAt: '2026-11-14T12:00:00.000Z',
    })),
  };
  const credentials = { hasUsablePassword: vi.fn(async () => hasPassword) };
  const service = new ClientPortalService(
    database,
    {} as GetProjectUseCase,
    {} as GetSupportPlanUseCase,
    createUser as unknown as CreateUserUseCase,
    grant as unknown as GrantUserAccessUseCase,
    credentials as unknown as UserCredentialRepository,
  );
  return {
    service, createUser, grant, credentials, tx,
    execute: (enabled = true) => service.setClientContactAccess(
      CLIENT_ID, CONTACT_ID,
      { enabled, projectIds: [], supportPlanIds: [] },
      { id: '44444444-4444-4444-8444-444444444444', email: 'pmo@kabeli.cl', role: 'pmo' },
    ),
  };
}

describe('Portal cliente: invitación al habilitar acceso', () => {
  it('crea una cuenta nueva y solicita invitación para definir contraseña', async () => {
    const ctx = scenario({ accountExists: false });
    const result = await ctx.execute();
    expect(ctx.createUser.execute).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ role: 'cliente', grantAccess: true, clientId: CLIENT_ID }),
    }));
    expect(ctx.grant.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      userId: USER_ID, invitationAttempted: true, invitationSent: true, enabled: true,
    });
  });

  it('reintenta invitación para cuenta ya existente sin contraseña', async () => {
    const ctx = scenario({ accountExists: true, hasPassword: false });
    const result = await ctx.execute();
    expect(ctx.credentials.hasUsablePassword).toHaveBeenCalledWith(USER_ID);
    expect(ctx.grant.execute).toHaveBeenCalledWith({
      userId: USER_ID,
      actor: { userId: '44444444-4444-4444-8444-444444444444', email: 'pmo@kabeli.cl' },
    });
    expect(result).toMatchObject({ invitationAttempted: true, invitationSent: true, enabled: true });
    expect(ctx.createUser.execute).not.toHaveBeenCalled();
  });

  it('no cambia la contraseña ni reenvía al actualizar permisos de cuenta ya activada', async () => {
    const ctx = scenario({ hasPassword: true });
    const result = await ctx.execute();
    expect(ctx.grant.execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({ invitationAttempted: false, invitationSent: false });
  });

  it('no envía invitación al revocar acceso', async () => {
    const ctx = scenario({ hasPassword: false });
    const result = await ctx.execute(false);
    expect(ctx.grant.execute).not.toHaveBeenCalled();
    expect(ctx.credentials.hasUsablePassword).not.toHaveBeenCalled();
    expect(result).toMatchObject({ invitationAttempted: false, invitationSent: false, enabled: false });
  });

  it('expone el fallo de envío sin deshacer los permisos guardados, para permitir reintento', async () => {
    const ctx = scenario({ hasPassword: false, invitationSent: false });
    const result = await ctx.execute();
    expect(ctx.tx.insert).toHaveBeenCalled();
    expect(ctx.grant.execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ invitationAttempted: true, invitationSent: false, enabled: true });
  });
});
