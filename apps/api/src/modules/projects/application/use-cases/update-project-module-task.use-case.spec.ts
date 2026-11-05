import { describe, expect, it, vi } from 'vitest';
import type { Permission } from '@kora/contracts';
import { UpdateProjectModuleTaskUseCase } from './update-project-module-task.use-case';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRecord, ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type {
  ProjectTeamMemberRecord,
  ProjectTeamMemberRepository,
} from '../../domain/repositories/project-team-member.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import type { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import { FixedClock, PassthroughUnitOfWork } from '../../../../test/fakes';
import type { ProjectTaskReviewNotifier } from '../../infrastructure/services/project-task-review-notifier';

const FAKE_PROJECT = {
  id: 'project-1',
  isDeleted: false,
  leaderUserId: 'leader-1',
} as unknown as import('../../domain/entities/project.entity').Project;

function buildModule(overrides: Partial<ProjectModuleRecord['tasks'][number]> = {}): ProjectModuleRecord {
  return {
    id: 'module-1',
    projectId: 'project-1',
    name: 'Módulo Financiero',
    deliveries: [],
    segments: overrides.segmentId ? [{
      id: overrides.segmentId, teamId: 'team-1',
      startDate: new Date('2026-08-01'), endDate: new Date('2026-09-30'),
      closedAt: null, estimatedHours: 8, members: [],
    }] : [],
    tasks: [
      {
        id: 'task-1',
        moduleId: 'module-1',
        teamId: 'team-1',
        teamName: 'Desarrollo',
        assigneeUserId: 'collab-1',
        assigneeName: 'Ana Rojas',
        name: 'Maqueta',
        description: null,
        startDate: new Date('2026-08-18'),
        // FixedClock = 2026-08-25: fecha límite pasada por 5 días.
        date: new Date('2026-08-20'),
        estimatedHours: 8,
        status: 'in_review',
        scope: 'desarrollo',
        completedAt: null,
        rejectionReason: null,
        ...overrides,
      },
    ],
  } as unknown as ProjectModuleRecord;
}

function buildUseCase(module: ProjectModuleRecord) {
  const changeLogRecord = vi.fn().mockResolvedValue(undefined);
  const recalculateProgress = vi.fn().mockResolvedValue(undefined);
  const refreshSegmentClosure = vi.fn().mockResolvedValue(undefined);
  const publishNotification = vi.fn().mockResolvedValue(undefined);
  const useCase = new UpdateProjectModuleTaskUseCase(
    { findById: vi.fn().mockResolvedValue(FAKE_PROJECT) } as unknown as ProjectRepository,
    { findById: vi.fn().mockResolvedValue(module), updateTask: vi.fn().mockResolvedValue(undefined),
      refreshSegmentClosure } as unknown as ProjectModuleRepository,
    { isTeamLeaderForProject: vi.fn().mockResolvedValue(false), findByProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamRepository,
    {
      listForProject: vi.fn().mockResolvedValue([
        { userId: 'collab-1', teamId: 'team-1', fullName: 'Ana Rojas', userStatus: 'disabled' },
        { userId: 'collab-2', teamId: 'team-1', fullName: 'Luis Soto', userStatus: 'active' },
        { userId: 'collab-3', teamId: 'team-1', fullName: 'Rosa Díaz', userStatus: 'disabled' },
      ] as ProjectTeamMemberRecord[]),
    } as unknown as ProjectTeamMemberRepository,
    { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder,
    { record: changeLogRecord } as unknown as ProjectChangeLogRecorder,
    { recalculate: recalculateProgress } as unknown as ProjectProgressRecalculator,
    { syncTask: vi.fn().mockResolvedValue(undefined) } as unknown as ForecastSourceSyncService,
    new FixedClock(),
    new PassthroughUnitOfWork(),
    { publish: publishNotification } as unknown as ProjectTaskReviewNotifier,
  );
  return { useCase, changeLogRecord, recalculateProgress, refreshSegmentClosure, publishNotification };
}

const LEADER = { actor: { userId: 'leader-1', email: 'leader@kabeli.cl' }, actorPermissions: [] as Permission[] };
const TARGET = { projectId: 'project-1', moduleId: 'module-1', taskId: 'task-1' };

const logged = (changeLogRecord: ReturnType<typeof vi.fn>) =>
  changeLogRecord.mock.calls.flatMap(([entries]) => entries as { message: string; taskId: string }[]);

/** Sin esto, aprobar/rechazar/editar una tarea no dejaba rastro en la bitácora (quién, cuándo, a tiempo o no). */
describe('UpdateProjectModuleTaskUseCase — bitácora', () => {
  it('al aprobar, registra quién y si fue a tiempo o con atraso, ligado a la tarea', async () => {
    const { useCase, changeLogRecord } = buildUseCase(buildModule({ status: 'in_review' }));

    await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'done' } });

    expect(changeLogRecord.mock.calls[0]![1]).toBe('leader-1');
    expect(logged(changeLogRecord)).toEqual([
      expect.objectContaining({
        taskId: 'task-1',
        message: 'Tarea "Maqueta" aprobada en fase "Módulo Financiero", con 5 días de atraso (fecha comprometida 20-08-2026).',
      }),
    ]);
  });

  it('al aprobar, recalcula el avance del proyecto en la misma transacción', async () => {
    const { useCase, recalculateProgress } = buildUseCase(buildModule({ status: 'in_review' }));

    await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'done' } });

    expect(recalculateProgress).toHaveBeenCalledWith('project-1', expect.anything());
  });

  it('al aprobar la última tarea vinculada, concilia el cierre real en la misma transacción', async () => {
    const { useCase, refreshSegmentClosure } = buildUseCase(
      buildModule({ status: 'in_review', segmentId: 'segment-1' }),
    );
    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'done' } });
    expect(result.isOk()).toBe(true);
    expect(refreshSegmentClosure).toHaveBeenCalledWith(
      'segment-1', expect.any(Date), expect.anything(),
    );
  });

  it('al rechazar, el registro incluye el motivo', async () => {
    const { useCase, changeLogRecord } = buildUseCase(buildModule({ status: 'in_review' }));

    await useCase.execute({ ...TARGET, ...LEADER, data: { status: 'in_progress', rejectionReason: 'Falta el responsive' } });

    expect(logged(changeLogRecord).map((entry) => entry.message)).toEqual([
      'Tarea "Maqueta" rechazada en fase "Módulo Financiero": Falta el responsive',
    ]);
  });

  it('reasignar y cambiar la fecha límite deja un registro por cambio; los campos sin cambios no', async () => {
    const { useCase, changeLogRecord } = buildUseCase(buildModule({ status: 'todo' }));

    await useCase.execute({
      ...TARGET,
      ...LEADER,
      data: { assigneeUserId: 'collab-2', date: '2026-09-01', name: 'Maqueta', estimatedHours: 8 },
    });

    expect(logged(changeLogRecord).map((entry) => entry.message)).toEqual([
      'Tarea "Maqueta" reasignada de Ana Rojas a Luis Soto en fase "Módulo Financiero".',
      'Tarea "Maqueta" en fase "Módulo Financiero": fecha límite cambiada de 20-08-2026 a 01-09-2026.',
    ]);
  });
});

/** Un deshabilitado ya no entra al sistema: asignarle una tarea la dejaría sin dueño. */
describe('UpdateProjectModuleTaskUseCase — colaborador deshabilitado', () => {
  it('no permite reasignar la tarea a un colaborador deshabilitado', async () => {
    const { useCase, changeLogRecord } = buildUseCase(buildModule({ status: 'todo' }));

    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { assigneeUserId: 'collab-3' } });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('PROJECT_ASSIGNEE_DISABLED');
    expect(changeLogRecord).not.toHaveBeenCalled();
  });

  it('editar otra cosa de una tarea cuyo colaborador ya está deshabilitado sigue permitido', async () => {
    const { useCase } = buildUseCase(buildModule({ status: 'todo' }));

    const result = await useCase.execute({ ...TARGET, ...LEADER, data: { assigneeUserId: 'collab-1', name: 'Maqueta v2' } });

    expect(result.isOk()).toBe(true);
  });
});


describe('Notificaciones de revisión y devolución de tareas', () => {
  it('avisa al líder del proyecto cuando el colaborador marca la tarea como completada', async () => {
    const { useCase, publishNotification } = buildUseCase(buildModule({ status: 'in_progress' }));
    const result = await useCase.execute({
      ...TARGET,
      actor: { userId: 'collab-1', email: 'ana@kabeli.cl' },
      actorPermissions: [],
      data: { status: 'in_review' },
    });
    expect(result.isOk()).toBe(true);
    expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'review_requested', projectLeaderUserId: 'leader-1',
      taskId: 'task-1', assigneeUserId: 'collab-1',
    }));
  });

  it('avisa al colaborador cuando el líder devuelve una tarea y conserva el motivo', async () => {
    const { useCase, publishNotification } = buildUseCase(buildModule({ status: 'in_review' }));
    const result = await useCase.execute({
      ...TARGET, ...LEADER,
      data: { status: 'in_progress', rejectionReason: 'Corregir integración' },
    });
    expect(result.isOk()).toBe(true);
    expect(publishNotification).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'returned', reason: 'Corregir integración', assigneeUserId: 'collab-1',
      actorUserId: 'leader-1',
    }));
  });

  it('no notifica de nuevo por aprobar una tarea ni por actualizar el mismo estado', async () => {
    const approved = buildUseCase(buildModule({ status: 'in_review' }));
    await approved.useCase.execute({ ...TARGET, ...LEADER, data: { status: 'done' } });
    expect(approved.publishNotification).not.toHaveBeenCalled();
    const unchanged = buildUseCase(buildModule({ status: 'in_review' }));
    await unchanged.useCase.execute({ ...TARGET, ...LEADER, data: { status: 'in_review' } });
    expect(unchanged.publishNotification).not.toHaveBeenCalled();
  });

  it('sin motivo válido no devuelve la tarea ni envía aviso', async () => {
    const { useCase, publishNotification } = buildUseCase(buildModule({ status: 'in_review' }));
    const result = await useCase.execute({
      ...TARGET, ...LEADER, data: { status: 'in_progress', rejectionReason: '  ' },
    });
    expect(result.isErr()).toBe(true);
    expect(publishNotification).not.toHaveBeenCalled();
  });
});
