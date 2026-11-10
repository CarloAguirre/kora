import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreateUserInput } from '@kora/contracts';
import type { ClientPortalProvisioner } from '../ports/client-portal-provisioner.port';
import { CreateUserUseCase } from './create-user.use-case';
import { InMemoryUserRepository } from '../../../../test/fakes/in-memory-user.repository';
import {
  FixedClock,
  InMemoryCredentialRepository,
  InMemoryInvitationRepository,
  InMemoryTeamReader,
  PassthroughUnitOfWork,
  PredictableTokenGenerator,
  RecordingAuditRecorder,
  RecordingNotificationSender,
  SequentialIdGenerator,
} from '../../../../test/fakes';
import type { ActorContext } from '../../../../shared/application/use-case';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { PersonName } from '../../domain/value-objects/person-name.vo';

const ACTOR: ActorContext = { userId: 'admin-1', email: 'admin@kabeli.cl' };

function buildInput(overrides: Partial<CreateUserInput> = {}): CreateUserInput {
  return {
    email: 'nuevo@kabeli.cl',
    firstName: 'Nuevo',
    lastName: 'Usuario',
    role: 'collaborator',
    teamId: 'team-1',
    isCommercialManager: false,
    grantAccess: true,
    ...overrides,
  };
}

describe('CreateUserUseCase', () => {
  let users: InMemoryUserRepository;
  let credentials: InMemoryCredentialRepository;
  let teams: InMemoryTeamReader;
  let invitations: InMemoryInvitationRepository;
  let notifications: RecordingNotificationSender;
  let audit: RecordingAuditRecorder;
  let unitOfWork: PassthroughUnitOfWork;
  let useCase: CreateUserUseCase;
  let provisionPortal: ReturnType<typeof vi.fn<ClientPortalProvisioner['provision']>>;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    credentials = new InMemoryCredentialRepository();
    teams = new InMemoryTeamReader([{ id: 'team-1', name: 'Desarrollo' }]);
    invitations = new InMemoryInvitationRepository();
    notifications = new RecordingNotificationSender();
    audit = new RecordingAuditRecorder();
    unitOfWork = new PassthroughUnitOfWork();
    provisionPortal = vi.fn<ClientPortalProvisioner['provision']>().mockResolvedValue(undefined);

    useCase = new CreateUserUseCase(
      users,
      credentials,
      teams,
      invitations,
      notifications,
      new PredictableTokenGenerator(),
      audit,
      unitOfWork,
      new FixedClock(),
      new SequentialIdGenerator('user'),
      { provision: provisionPortal },
    );
  });

  it('exige empresa para un usuario externo y no crea cuentas sin ella', async () => {
    const result = await useCase.execute({
      data: buildInput({ role: 'cliente', teamId: null }),
      actor: ACTOR,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('USER_CLIENT_COMPANY_REQUIRED');
    expect(users.all()).toHaveLength(0);
    expect(provisionPortal).not.toHaveBeenCalled();
  });

  it('crea cliente y contacto en el mismo ciclo transaccional, sin conceder proyectos', async () => {
    const data = buildInput({
      role: 'cliente', teamId: null,
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: '  CLIENTE@ejemplo.cl ',
      firstName: 'María', lastName: 'Pérez',
    });
    const result = await useCase.execute({ data, actor: ACTOR });
    expect(result.isOk()).toBe(true);
    expect(provisionPortal).toHaveBeenCalledExactlyOnceWith({
      userId: users.all()[0]?.id,
      clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      email: 'cliente@ejemplo.cl',
      fullName: 'María Pérez',
      actorUserId: ACTOR.userId,
      enabled: true,
    }, expect.anything());
    expect(unitOfWork.calls).toBe(1);
  });

  it('respeta la casilla sin acceso para el portal', async () => {
    await useCase.execute({
      data: buildInput({
        role: 'cliente', teamId: null, clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        grantAccess: false,
      }), actor: ACTOR,
    });
    expect(provisionPortal).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }), expect.anything(),
    );
    expect(notifications.invitations).toHaveLength(0);
  });

  it('no permite asignar una empresa a un usuario interno', async () => {
    const result = await useCase.execute({
      data: buildInput({ clientId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
      actor: ACTOR,
    });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('USER_CLIENT_COMPANY_NOT_ALLOWED');
    expect(users.all()).toHaveLength(0);
  });

  it('crea el usuario y le envía la invitación', async () => {
    const result = await useCase.execute({ data: buildInput(), actor: ACTOR });

    expect(result.isOk()).toBe(true);
    expect(users.all()).toHaveLength(1);
    expect(notifications.invitations[0]?.email).toBe('nuevo@kabeli.cl');
  });

  it('crea el usuario SIN contraseña: la fija la propia persona por el enlace', async () => {
    await useCase.execute({ data: buildInput(), actor: ACTOR });
    const created = users.all()[0];

    const credential = await credentials.findByUserId(created!.id);

    expect(credential?.passwordHash).toBeNull();
    expect(credential?.mustChangePassword).toBe(true);
    // Ninguna contraseña inicial viaja por correo ni la conoce quien da el alta.
    expect(notifications.invitations[0]).not.toHaveProperty('password');
  });

  it('normaliza el correo antes de guardarlo', async () => {
    await useCase.execute({
      data: buildInput({ email: '  Nuevo@KABELI.cl ' }),
      actor: ACTOR,
    });

    expect(users.all()[0]?.email.value).toBe('nuevo@kabeli.cl');
  });

  it('rechaza un correo ya usado, aunque venga con otro formato', async () => {
    users.seed(
      User.create({
        id: 'existente',
        email: Email.create('nuevo@kabeli.cl').unwrap(),
        name: PersonName.create('Otro', 'Usuario').unwrap(),
        role: 'collaborator',
        teamId: 'team-1',
        now: new Date(),
      }),
    );

    const result = await useCase.execute({
      data: buildInput({ email: 'NUEVO@kabeli.cl' }),
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('USER_EMAIL_ALREADY_IN_USE');
  });

  it('exige equipo a un colaborador', async () => {
    const result = await useCase.execute({
      data: buildInput({ teamId: null }),
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('USER_TEAM_REQUIRED');
    expect(users.all()).toHaveLength(0);
  });

  it('ignora el equipo indicado para un rol que no lo admite', async () => {
    const result = await useCase.execute({
      data: buildInput({ role: 'admin', teamId: 'team-1' }),
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect(users.all()[0]?.teamId).toBeNull();
  });

  it('rechaza un equipo inexistente', async () => {
    const result = await useCase.execute({
      data: buildInput({ teamId: 'team-fantasma' }),
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('TEAM_NOT_FOUND');
  });

  it('sin acceso concedido no crea credencial ni invitación', async () => {
    await useCase.execute({ data: buildInput({ grantAccess: false }), actor: ACTOR });
    const created = users.all()[0];

    expect(await credentials.findByUserId(created!.id)).toBeNull();
    expect(invitations.records).toHaveLength(0);
    expect(notifications.invitations).toHaveLength(0);
  });

  it('si falla el envío del correo, el usuario queda creado igualmente', async () => {
    // El alta ya está confirmada en base; reenviar la invitación es trivial.
    // Revertirla por un fallo del proveedor de correo sería mucho peor.
    notifications.shouldFail = true;

    const result = await useCase.execute({ data: buildInput(), actor: ACTOR });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.invitationSent).toBe(false);
    expect(users.all()).toHaveLength(1);
  });

  it('escribe usuario, credencial e invitación en una sola transacción', async () => {
    await useCase.execute({ data: buildInput(), actor: ACTOR });

    expect(unitOfWork.calls).toBe(1);
  });

  it('deja constancia en la auditoría', async () => {
    await useCase.execute({ data: buildInput(), actor: ACTOR });
    const created = users.all()[0];

    expect(audit.actionsFor(created!.id)).toContain('create');
    expect(audit.entries[0]?.actor.email).toBe('admin@kabeli.cl');
  });

  it('rechaza un correo con formato inválido', async () => {
    const result = await useCase.execute({
      data: buildInput({ email: 'esto-no-es-un-correo' }),
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('USER_INVALID_EMAIL');
  });
});
