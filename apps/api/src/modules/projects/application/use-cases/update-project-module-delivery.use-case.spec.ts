import { describe, expect, it, vi } from 'vitest';
import { UpdateProjectModuleDeliveryUseCase } from './update-project-module-delivery.use-case';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository, ProjectModuleRecord } from '../../domain/repositories/project-module.repository';
import type { ApplicationError, Result } from '@kora/core';
import type { Permission } from '@kora/contracts';
import type { ProjectTeamRecord, ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type {
  ProjectTeamMemberRecord,
  ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import { FixedClock } from '../../../../test/fakes';

const FAKE_PROJECT = {
  id: 'project-1',
  isDeleted: false,
  toSnapshot: () => ({ leaderUserId: 'leader-1' }),
} as unknown as import('../../domain/entities/project.entity').Project;

function buildModule(overrides: Partial<ProjectModuleRecord['deliveries'][number]> = {}): ProjectModuleRecord {
  return {
    id: 'module-1',
    projectId: 'project-1',
    name: 'Módulo Financiero',
    initialStage: 'development',
    currentStage: 'development',
    estimatedHours: null,
    estimatedStartDate: null,
    estimatedEndDate: null,
    segments: [],
    tasks: [],
    blockerCount: 0,
    deliveries: [
      {
        id: 'delivery-1',
        moduleId: 'module-1',
        teamId: 'team-1',
        teamName: 'UX-UI',
        name: 'Entrega 1',
        description: null,
        assigneeUserId: null,
        assigneeName: null,
        estimatedDate: new Date('2026-09-24'),
        status: 'delivered',
        rejectionReason: null,
        ...overrides,
      },
    ],
  } as ProjectModuleRecord;
}

const TEAMS = [
  { teamId: 'team-1', teamName: 'UX-UI' },
  { teamId: 'team-2', teamName: 'Desarrollo' },
] as ProjectTeamRecord[];

const MEMBERS = [
  { userId: 'collab-1', teamId: 'team-1', fullName: 'Ana Rojas' },
  { userId: 'collab-2', teamId: 'team-1', fullName: 'Luis Soto' },
  { userId: 'collab-3', teamId: 'team-2', fullName: 'Marta Díaz' },
] as ProjectTeamMemberRecord[];

function buildUseCase(
  module: ProjectModuleRecord,
  changeLogRecord: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(undefined),
  { isTeamLeader = false }: { isTeamLeader?: boolean } = {},
) {
  const projects = { findById: vi.fn().mockResolvedValue(FAKE_PROJECT) } as unknown as ProjectRepository;
  const modules = {
    findById: vi.fn().mockResolvedValue(module),
    updateDelivery: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectModuleRepository;
  const projectTeams = {
    isTeamLeaderForProject: vi.fn().mockResolvedValue(isTeamLeader),
    findByProject: vi.fn().mockResolvedValue(TEAMS),
  } as unknown as ProjectTeamRepository;
  const projectTeamMembers = { listForProject: vi.fn().mockResolvedValue(MEMBERS) } as unknown as ProjectTeamMemberRepository;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const changeLog = { record: changeLogRecord } as unknown as ProjectChangeLogRecorder;

  const useCase = new UpdateProjectModuleDeliveryUseCase(
    projects,
    modules,
    projectTeams,
    projectTeamMembers,
    audit,
    changeLog,
    new FixedClock(),
  );
  return { useCase, modules, changeLogRecord };
}

const LEADER = { actor: { userId: 'leader-1', email: 'leader@kabeli.cl' }, actorPermissions: [] as Permission[] };
const COLLABORATOR = { actor: { userId: 'collab-1', email: 'ana@kabeli.cl' }, actorPermissions: ['hours:register'] as Permission[] };
const TARGET = { projectId: 'project-1', moduleId: 'module-1', deliveryId: 'delivery-1' };

const loggedMessages = (changeLogRecord: ReturnType<typeof vi.fn>): string[] =>
  changeLogRecord.mock.calls.flatMap(([entries]) => (entries as { message: string }[]).map((entry) => entry.message));

const errorCode = (result: Result<void, ApplicationError>): string | null => (result.isErr() ? result.error.code : null);

/**
 * Sin esto, el líder de proyecto no se entera cuando su equipo aprueba/rechaza/entrega
 * algo: la bitácora solo mostraba la entrega con su fecha estimada (no cuándo cambió el
 * estado). Ver `ProjectChangeLogRecorder`.
 */
describe('UpdateProjectModuleDeliveryUseCase — bitácora automática', () => {
  it('al aprobar una entrega, registra un evento de bitácora con el nombre de la entrega y la fase', async () => {
    const changeLogRecord = vi.fn().mockResolvedValue(undefined);
    const { useCase } = buildUseCase(buildModule({ status: 'delivered' }), changeLogRecord);

    const result = await useCase.execute({
      projectId: 'project-1',
      moduleId: 'module-1',
      deliveryId: 'delivery-1',
      data: { status: 'approved' },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:manage'],
    });

    expect(result.isOk()).toBe(true);
    expect(changeLogRecord).toHaveBeenCalledTimes(1);
    const [entries, actorUserId] = changeLogRecord.mock.calls[0]!;
    expect(actorUserId).toBe('leader-1');
    expect(entries).toEqual([
      expect.objectContaining({
        projectId: 'project-1',
        moduleId: 'module-1',
        message: expect.stringContaining('Entrega "Entrega 1" aprobada en fase "Módulo Financiero"'),
      }),
    ]);
  });

  it('al rechazar una entrega, el mensaje incluye el motivo', async () => {
    const changeLogRecord = vi.fn().mockResolvedValue(undefined);
    const { useCase } = buildUseCase(buildModule({ status: 'delivered' }), changeLogRecord);

    await useCase.execute({
      projectId: 'project-1',
      moduleId: 'module-1',
      deliveryId: 'delivery-1',
      data: { status: 'planned', rejectionReason: 'Faltan gráficos clave' },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:manage'],
    });

    expect(changeLogRecord).toHaveBeenCalledTimes(1);
    const [entries] = changeLogRecord.mock.calls[0]!;
    expect(entries[0].message).toContain('rechazada en fase "Módulo Financiero": Faltan gráficos clave');
  });

  it('si el status no cambia (se edita otro campo), registra solo ese cambio, no uno de estado', async () => {
    const changeLogRecord = vi.fn().mockResolvedValue(undefined);
    const { useCase } = buildUseCase(buildModule({ status: 'approved' }), changeLogRecord);

    await useCase.execute({
      projectId: 'project-1',
      moduleId: 'module-1',
      deliveryId: 'delivery-1',
      data: { description: 'Nueva descripción' },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:manage'],
    });

    expect(loggedMessages(changeLogRecord)).toEqual([expect.stringContaining('descripción actualizada')]);
  });

  it('si no cambia nada (mismos valores), no registra nada en la bitácora', async () => {
    const changeLogRecord = vi.fn().mockResolvedValue(undefined);
    const { useCase } = buildUseCase(buildModule({ status: 'approved', name: 'Entrega 1' }), changeLogRecord);

    await useCase.execute({ ...TARGET, ...LEADER, data: { name: 'Entrega 1', status: 'approved', estimatedDate: '2026-09-24' } });

    expect(changeLogRecord).not.toHaveBeenCalled();
  });
});

describe('UpdateProjectModuleDeliveryUseCase — ciclo de vida', () => {
  it('no deja aprobar una entrega que el colaborador todavía no marcó como terminada', async () => {
    const { useCase, modules } = buildUseCase(buildModule({ status: 'planned', assigneeUserId: 'collab-1' }));

    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'approved' } });

    expect(errorCode(result)).toBe('PROJECT_MODULE_DELIVERY_INVALID_TRANSITION');
    expect(modules.updateDelivery).not.toHaveBeenCalled();
  });

  it('no deja marcar como terminada una entrega sin colaborador asignado', async () => {
    const { useCase } = buildUseCase(buildModule({ status: 'planned', assigneeUserId: null }));

    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'delivered' } });

    expect(errorCode(result)).toBe('PROJECT_MODULE_DELIVERY_INVALID_TRANSITION');
  });

  it('el colaborador asignado marca su entrega como terminada y queda pendiente de aprobación en la bitácora', async () => {
    const { useCase, changeLogRecord } = buildUseCase(buildModule({ status: 'planned', assigneeUserId: 'collab-1' }));

    const result = await useCase.execute({ ...TARGET, ...COLLABORATOR, data: { status: 'delivered' } });

    expect(result.isOk()).toBe(true);
    expect(loggedMessages(changeLogRecord)).toEqual([expect.stringContaining('marcada como terminada')]);
    expect(changeLogRecord.mock.calls[0]![1]).toBe('collab-1');
  });

  it('el líder puede marcarla como terminada por el colaborador, y el registro dice en nombre de quién', async () => {
    const { useCase, changeLogRecord } = buildUseCase(
      buildModule({ status: 'planned', assigneeUserId: 'collab-1', assigneeName: 'Ana Rojas' }),
    );

    const result = await useCase.execute({
      ...TARGET,
      ...LEADER,
      data: { status: 'delivered', comment: 'La entregó por correo al cliente' },
    });

    expect(result.isOk()).toBe(true);
    expect(changeLogRecord.mock.calls[0]![1]).toBe('leader-1');
    expect(loggedMessages(changeLogRecord)).toEqual([
      expect.stringMatching(/marcada como terminada en nombre de Ana Rojas .* Motivo: La entregó por correo al cliente$/),
    ]);
  });

  it('marcarla terminada en nombre del colaborador sin explicar por qué no se permite', async () => {
    const { useCase, modules } = buildUseCase(buildModule({ status: 'planned', assigneeUserId: 'collab-1' }));

    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'delivered' } });

    expect(errorCode(result)).toBe('PROJECT_MODULE_DELIVERY_ON_BEHALF_COMMENT_REQUIRED');
    expect(modules.updateDelivery).not.toHaveBeenCalled();
  });

  it('el colaborador no puede deshacer una aprobación volviendo a marcarla como terminada', async () => {
    const { useCase, modules } = buildUseCase(buildModule({ status: 'approved', assigneeUserId: 'collab-1' }));

    const result = await useCase.execute({ ...TARGET, ...COLLABORATOR, data: { status: 'delivered' } });

    expect(errorCode(result)).toBe('PROJECT_MODULE_DELIVERY_LIMITED_UPDATE');
    expect(modules.updateDelivery).not.toHaveBeenCalled();
  });

  it('el líder de equipo puede aprobar', async () => {
    const { useCase } = buildUseCase(buildModule({ status: 'delivered', assigneeUserId: 'collab-1' }), undefined, {
      isTeamLeader: true,
    });

    const result = await useCase.execute({
      ...TARGET,
      actor: { userId: 'team-leader-1', email: 'tl@kabeli.cl' },
      actorPermissions: [],
      data: { status: 'approved' },
    });

    expect(result.isOk()).toBe(true);
  });

  it('revertir una aprobación queda registrado como tal, no como "marcada como terminada"', async () => {
    const { useCase, changeLogRecord } = buildUseCase(buildModule({ status: 'approved', assigneeUserId: 'collab-1' }));

    await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'delivered', rejectionReason: null } });

    expect(loggedMessages(changeLogRecord)).toEqual([expect.stringContaining('Se revirtió la aprobación')]);
  });
});

describe('UpdateProjectModuleDeliveryUseCase — asignación', () => {
  it('rechaza asignar a alguien que no es del equipo de la entrega', async () => {
    const { useCase, modules } = buildUseCase(buildModule({ status: 'planned', teamId: 'team-1' }));

    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { assigneeUserId: 'collab-3' } });

    expect(errorCode(result)).toBe('PROJECT_MODULE_DELIVERY_ASSIGNEE_NOT_IN_TEAM');
    expect(modules.updateDelivery).not.toHaveBeenCalled();
  });

  it('asignar y reasignar quedan en la bitácora con el nombre del colaborador', async () => {
    const first = buildUseCase(buildModule({ status: 'planned', assigneeUserId: null }));
    await first.useCase.execute({ ...TARGET, ...LEADER, data: { assigneeUserId: 'collab-1' } });
    expect(loggedMessages(first.changeLogRecord)).toEqual([expect.stringContaining('asignada a Ana Rojas')]);

    const second = buildUseCase(buildModule({ status: 'planned', assigneeUserId: 'collab-1', assigneeName: 'Ana Rojas' }));
    await second.useCase.execute({ ...TARGET, ...LEADER, data: { assigneeUserId: 'collab-2' } });
    expect(loggedMessages(second.changeLogRecord)).toEqual([expect.stringContaining('reasignada de Ana Rojas a Luis Soto')]);
  });

  it('al cambiar de equipo, desasigna al colaborador que no pertenece al nuevo', async () => {
    const { useCase, modules, changeLogRecord } = buildUseCase(
      buildModule({ status: 'planned', teamId: 'team-1', assigneeUserId: 'collab-1', assigneeName: 'Ana Rojas' }),
    );

    await useCase.execute({ ...TARGET, ...LEADER, data: { teamId: 'team-2' } });

    expect(modules.updateDelivery).toHaveBeenCalledWith(
      'delivery-1',
      expect.objectContaining({ teamId: 'team-2', assigneeUserId: null }),
      expect.any(Date),
    );
    expect(loggedMessages(changeLogRecord)).toEqual([
      expect.stringContaining('equipo cambiado de "UX-UI" a "Desarrollo"'),
      expect.stringContaining('quedó sin colaborador asignado'),
    ]);
  });

  it('rechaza mover la entrega a un equipo que no está en el proyecto', async () => {
    const { useCase } = buildUseCase(buildModule({ status: 'planned' }));

    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { teamId: 'team-ajeno' } });

    expect(errorCode(result)).toBe('PROJECT_MODULE_DELIVERY_TEAM_NOT_IN_PROJECT');
  });
});
