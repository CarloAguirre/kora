import { describe, expect, it, vi } from 'vitest';
import { DeleteUserUseCase } from './delete-user.use-case';
import { InMemoryUserRepository } from '../../../../test/fakes/in-memory-user.repository';
import {
  FixedClock, PassthroughUnitOfWork, RecordingAuditRecorder, RecordingSessionRevoker,
} from '../../../../test/fakes';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { PersonName } from '../../domain/value-objects/person-name.vo';
import type { ClientPortalProvisioner } from '../ports/client-portal-provisioner.port';

const NOW = new Date('2026-11-11T10:00:00.000Z');
const ACTOR = { userId: 'admin-1', email: 'pmo@kabeli.cl' };

function buildUser(id: string, role: 'cliente' | 'admin' = 'cliente') {
  return User.create({
    id, email: Email.create(`${id}@ejemplo.cl`).unwrap(),
    name: PersonName.create('Contacto', 'Externo').unwrap(),
    role, teamId: null, now: NOW,
  });
}

describe('DeleteUserUseCase — desvinculación del portal', () => {
  function setup() {
    const users = new InMemoryUserRepository();
    const sessions = new RecordingSessionRevoker();
    const audit = new RecordingAuditRecorder();
    const unitOfWork = new PassthroughUnitOfWork();
    const detachUser = vi.fn<ClientPortalProvisioner['detachUser']>().mockResolvedValue(undefined);
    const portal = {
      provision: vi.fn<ClientPortalProvisioner['provision']>(),
      detachUser,
    };
    const service = new DeleteUserUseCase(
      users, sessions, audit, unitOfWork, new FixedClock(NOW), portal,
    );
    return { users, sessions, audit, unitOfWork, detachUser, service };
  }

  it('elimina lógicamente la cuenta cliente y libera vínculo/grants en la misma transacción', async () => {
    const ctx = setup();
    ctx.users.seed(buildUser('cliente-1'));

    const result = await ctx.service.execute({ userId: 'cliente-1', actor: ACTOR });

    expect(result.isOk()).toBe(true);
    expect(ctx.unitOfWork.calls).toBe(1);
    expect(ctx.detachUser).toHaveBeenCalledExactlyOnceWith('cliente-1', expect.anything());
    expect(ctx.sessions.revokedUsers).toEqual([{ userId: 'cliente-1', reason: 'admin_revoked' }]);
    expect((await ctx.users.findById('cliente-1'))?.deletedAt).not.toBeNull();
    expect(ctx.audit.actionsFor('cliente-1')).toContain('delete');
  });

  it('la baja de un usuario interno no falla si no tiene portal vinculado', async () => {
    const ctx = setup();
    ctx.users.seed(buildUser('admin-a', 'admin'), buildUser('admin-b', 'admin'));

    const result = await ctx.service.execute({ userId: 'admin-a', actor: ACTOR });

    expect(result.isOk()).toBe(true);
    expect(ctx.detachUser).toHaveBeenCalledWith('admin-a', expect.anything());
  });

  it('no desvincula al último administrador si la eliminación está prohibida', async () => {
    const ctx = setup();
    ctx.users.seed(buildUser('admin-a', 'admin'));

    const result = await ctx.service.execute({ userId: 'admin-a', actor: ACTOR });

    expect(result.isErr()).toBe(true);
    expect(ctx.detachUser).not.toHaveBeenCalled();
    expect(ctx.sessions.revokedUsers).toHaveLength(0);
  });
});
