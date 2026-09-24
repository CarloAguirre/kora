import { describe, expect, it, vi } from 'vitest';
import { UpdateProjectModuleDeliveryUseCase } from './update-project-module-delivery.use-case';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository, ProjectModuleRecord } from '../../domain/repositories/project-module.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
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

function buildUseCase(module: ProjectModuleRecord, changeLogRecord: ReturnType<typeof vi.fn>) {
  const projects = { findById: vi.fn().mockResolvedValue(FAKE_PROJECT) } as unknown as ProjectRepository;
  const modules = {
    findById: vi.fn().mockResolvedValue(module),
    updateDelivery: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectModuleRepository;
  const projectTeams = {} as ProjectTeamRepository;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const changeLog = { record: changeLogRecord } as unknown as ProjectChangeLogRecorder;

  const useCase = new UpdateProjectModuleDeliveryUseCase(projects, modules, projectTeams, audit, changeLog, new FixedClock());
  return { useCase, modules };
}

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

  it('si el status no cambia (se edita otro campo), no registra nada en la bitácora', async () => {
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

    expect(changeLogRecord).not.toHaveBeenCalled();
  });
});
