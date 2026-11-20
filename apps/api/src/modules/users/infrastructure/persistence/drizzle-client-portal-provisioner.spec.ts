import { describe, expect, it, vi } from 'vitest';
import { clientPortalAccounts, type Database } from '@kora/db';
import { DrizzleClientPortalProvisioner } from './drizzle-client-portal-provisioner';
import type { TransactionContext } from '@kora/core';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CLIENT_ID = '22222222-2222-4222-8222-222222222222';
const CONTACT_ID = '33333333-3333-4333-8333-333333333333';
const OLD_USER_ID = '44444444-4444-4444-8444-444444444444';

function scenario(linked: { userId: string; deletedAt: Date | null } | null) {
  const rows: unknown[][] = [
    [{ id: CLIENT_ID }],
    [{ id: CONTACT_ID }],
    linked ? [linked] : [],
  ];
  const limit = vi.fn(async () => rows.shift() ?? []);
  type SelectChain = {
    from(): SelectChain;
    innerJoin(): SelectChain;
    where(): SelectChain;
    limit(count: number): Promise<unknown[]>;
  };
  const chain: SelectChain = {
    from: () => chain, innerJoin: () => chain, where: () => chain, limit,
  };
  const deleteWhere = vi.fn(async () => undefined);
  const insertValues = vi.fn(async () => undefined);
  const db = {
    select: vi.fn(() => chain),
    delete: vi.fn(() => ({ where: deleteWhere })),
    insert: vi.fn(() => ({ values: insertValues })),
  } as unknown as Database;
  const ctx: TransactionContext = { _brand: 'TransactionContext', tx: db } as TransactionContext;
  const adapter = new DrizzleClientPortalProvisioner(db);
  const provision = () => adapter.provision({
    userId: USER_ID, clientId: CLIENT_ID,
    email: 'contacto@ejemplo.cl', fullName: 'Contacto Externo',
    actorUserId: 'admin-1', enabled: true,
  }, ctx);
  return { db, deleteWhere, insertValues, provision, adapter, ctx };
}

describe('DrizzleClientPortalProvisioner — eliminación y alta posterior', () => {
  it('recupera un contacto retenido por una cuenta eliminada, revocando sus grants por cascade', async () => {
    const s = scenario({ userId: OLD_USER_ID, deletedAt: new Date('2026-11-10') });
    await s.provision();
    expect(s.db.delete).toHaveBeenCalledWith(clientPortalAccounts);
    expect(s.deleteWhere).toHaveBeenCalledOnce();
    expect(s.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID, clientId: CLIENT_ID, contactId: CONTACT_ID,
    }));
  });

  it('impide capturar un contacto que sigue vinculado a otra cuenta vigente', async () => {
    const s = scenario({ userId: OLD_USER_ID, deletedAt: null });
    await expect(s.provision()).rejects.toThrow(/vinculado/);
    expect(s.db.delete).not.toHaveBeenCalled();
    expect(s.db.insert).not.toHaveBeenCalled();
  });

  it('elimina solo la relación de portal para una baja lógica sin tocar la ficha comercial', async () => {
    const s = scenario(null);
    await s.adapter.detachUser(USER_ID, s.ctx);
    expect(s.db.delete).toHaveBeenCalledExactlyOnceWith(clientPortalAccounts);
    expect(s.deleteWhere).toHaveBeenCalledOnce();
    expect(s.db.insert).not.toHaveBeenCalled();
  });
});
