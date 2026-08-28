import { beforeEach, describe, expect, it } from 'vitest';
import { ChangeUserStatusUseCase } from './change-user-status.use-case';
import { InMemoryUserRepository } from '../../../../test/fakes/in-memory-user.repository';
import {
  FixedClock,
  InMemoryCredentialRepository,
  PassthroughUnitOfWork,
  RecordingAuditRecorder,
  RecordingNotificationSender,
  RecordingSessionRevoker,
} from '../../../../test/fakes';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { PersonName } from '../../domain/value-objects/person-name.vo';
import type { ActorContext } from '../../../../shared/application/use-case';
import type { RoleCode } from '@kora/contracts';

const ACTOR: ActorContext = { userId: 'admin-1', email: 'admin@kabeli.cl' };
const NOW = new Date('2026-08-25T12:00:00.000Z');

function buildUser(id: string, role: RoleCode = 'collaborator'): User {
  return User.create({
    id,
    email: Email.create(`${id}@kabeli.cl`).unwrap(),
    name: PersonName.create('Nombre', 'Apellido').unwrap(),
    role,
    teamId: role === 'collaborator' ? 'team-1' : null,
    now: NOW,
  });
}

describe('ChangeUserStatusUseCase', () => {
  let users: InMemoryUserRepository;
  let credentials: InMemoryCredentialRepository;
  let sessions: RecordingSessionRevoker;
  let notifications: RecordingNotificationSender;
  let audit: RecordingAuditRecorder;
  let useCase: ChangeUserStatusUseCase;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    credentials = new InMemoryCredentialRepository();
    sessions = new RecordingSessionRevoker();
    notifications = new RecordingNotificationSender();
    audit = new RecordingAuditRecorder();

    useCase = new ChangeUserStatusUseCase(
      users,
      credentials,
      sessions,
      notifications,
      audit,
      new PassthroughUnitOfWork(),
      new FixedClock(NOW),
    );
  });

  it('deshabilitar revoca las sesiones en el acto', async () => {
    // Ésta es la regresión que la v1 no podía evitar: allí el cierre de sesión
    // era una segunda llamada desde el navegador (`force-signout-user`), y si
    // fallaba, el usuario "deshabilitado" seguía navegando con su sesión viva.
    const user = buildUser('u1');
    users.seed(user);

    const result = await useCase.execute({
      userId: 'u1',
      data: { status: 'disabled' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect(sessions.revokedUsers).toEqual([{ userId: 'u1', reason: 'status_changed' }]);
  });

  it('rehabilitar limpia el bloqueo por intentos fallidos', async () => {
    const user = buildUser('u1');
    user.changeStatus('blocked', ACTOR.userId, NOW);
    users.seed(user);
    credentials.seed({
      userId: 'u1',
      passwordHash: 'bcrypt:x',
      passwordAlgorithm: 'bcrypt',
      mustChangePassword: false,
      failedAttempts: 5,
      lockedUntil: new Date('2030-01-01'),
      lastLoginAt: null,
      emailVerifiedAt: null,
    });

    await useCase.execute({ userId: 'u1', data: { status: 'active' }, actor: ACTOR });

    const credential = await credentials.findByUserId('u1');
    // Sin esto, la persona quedaría "habilitada" pero incapaz de entrar.
    expect(credential?.lockedUntil).toBeNull();
    expect(credential?.failedAttempts).toBe(0);
  });

  it('impide deshabilitar al último administrador activo', async () => {
    users.seed(buildUser('solo-admin', 'admin'));

    const result = await useCase.execute({
      userId: 'solo-admin',
      data: { status: 'disabled' },
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('USER_LAST_ADMINISTRATOR');
    expect(sessions.revokedUsers).toHaveLength(0);
  });

  it('permite deshabilitar a un administrador si queda otro activo', async () => {
    users.seed(buildUser('admin-a', 'admin'), buildUser('admin-b', 'pmo'));

    const result = await useCase.execute({
      userId: 'admin-a',
      data: { status: 'disabled' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
  });

  it('impide que alguien se deshabilite a sí mismo', async () => {
    users.seed(buildUser(ACTOR.userId, 'admin'), buildUser('otro-admin', 'admin'));

    const result = await useCase.execute({
      userId: ACTOR.userId,
      data: { status: 'disabled' },
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('USER_SELF_AUTHORIZATION_CHANGE');
  });

  it('un fallo al notificar no revierte el cambio de estado', async () => {
    users.seed(buildUser('u1'));
    notifications.shouldFail = true;

    const result = await useCase.execute({
      userId: 'u1',
      data: { status: 'disabled' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect((await users.findById('u1'))?.status).toBe('disabled');
  });

  it('registra el antes y el después en la auditoría', async () => {
    users.seed(buildUser('u1'));

    await useCase.execute({
      userId: 'u1',
      data: { status: 'disabled', reason: 'Fin de contrato' },
      actor: ACTOR,
    });

    const entry = audit.entries.at(-1);
    expect(entry?.action).toBe('status_change');
    expect(entry?.changes?.status).toEqual({ before: 'active', after: 'disabled' });
    expect(entry?.metadata?.reason).toBe('Fin de contrato');
  });

  it('no hace nada si el estado ya es el pedido', async () => {
    users.seed(buildUser('u1'));

    const result = await useCase.execute({
      userId: 'u1',
      data: { status: 'active' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect(audit.entries).toHaveLength(0);
    expect(sessions.revokedUsers).toHaveLength(0);
  });
});
