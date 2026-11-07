import { describe, expect, it, vi } from 'vitest';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { CreateHourEntryUseCase } from './create-hour-entry.use-case';

const actor = { userId: 'worker-1', email: 'colaborador@example.com' };
const data = {
  assignment: 'Proyecto' as const,
  projectId: 'project-1',
  moduleId: 'module-1',
  segmentId: 'segment-1',
  date: '2026-11-04',
  hours: 5,
  category: 'Desarrollo',
  isOvertime: false,
  hasBlocker: false,
};

function setup() {
  const save = vi.fn().mockResolvedValue(undefined);
  const projects = {
    findById: vi.fn().mockResolvedValue({ id: 'project-1', status: 'active', allowsOvertime: true }),
    findModuleById: vi.fn().mockResolvedValue({
      id: 'module-1', name: 'Fase', projectId: 'project-1',
      segments: [{ id: 'segment-1', name: 'Bloque' }],
      tasks: [
        { id: 'task-1', name: 'Diseño', segmentId: 'segment-1', assigneeUserId: 'worker-1', cancelledAt: null },
        { id: 'task-2', name: 'Otra persona', segmentId: 'segment-1', assigneeUserId: 'other-user', cancelledAt: null },
        { id: 'task-3', name: 'Otro bloque', segmentId: 'segment-2', assigneeUserId: 'worker-1', cancelledAt: null },
        { id: 'task-4', name: 'Cancelada', segmentId: 'segment-1', assigneeUserId: 'worker-1',
          cancelledAt: new Date('2026-11-03') },
      ],
    }),
    hasAttributableWorkBlocks: vi.fn().mockResolvedValue(false),
    findSegmentsForModule: vi.fn().mockResolvedValue([
      { id: 'segment-1', moduleId: 'module-1', projectId: 'project-1', teamId: 'team-1', name: 'Bloque' },
    ]),
    isUserOnSegmentTeam: vi.fn().mockResolvedValue(true),
  };
  const useCase = new CreateHourEntryUseCase(
    { save, sumApprovedHoursForProject: vi.fn(),
      sumRegularHoursForUserAndDate: vi.fn().mockResolvedValue(0) } as unknown as HourEntryRepository,
    { findById: vi.fn().mockResolvedValue({ id: 'worker-1', role: 'collaborator' }) } as unknown as HourEntryUserReader,
    projects as unknown as HourEntryProjectReader,
    { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder,
    { now: () => new Date('2026-11-04T12:00:00.000Z') },
    { generate: () => 'entry-1' },
  );
  return { useCase, save, projects };
}

describe('imputación verificable de HH a un bloque de trabajo', () => {
  it('guarda la tarea correcta sin inventar el consumo hasta la aprobación del registro', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({
      data: { ...data, taskId: 'task-1' }, actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(save.mock.calls[0]![0].toSnapshot()).toMatchObject({
      taskId: 'task-1', moduleId: 'module-1', segmentId: 'segment-1', status: 'pending',
    });
  });

  it.each(['task-2', 'task-3', 'task-4', 'fake-task'])(
    'rechaza atribuir HH a una tarea no válida: %s', async (taskId) => {
      const { useCase, save } = setup();
      const result = await useCase.execute({
        data: { ...data, taskId }, actor, actorRole: 'collaborator',
      });
      expect(result.isErr()).toBe(true);
      expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_TASK_INVALID');
      expect(save).not.toHaveBeenCalled();
    },
  );

  it('guarda el segmentId validado en el agregado; no suma HH pendientes', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({ data, actor, actorRole: 'collaborator' });
    expect(result.isOk()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    const entry = save.mock.calls[0]![0];
    expect(entry.toSnapshot()).toMatchObject({
      projectId: 'project-1', moduleId: 'module-1', segmentId: 'segment-1', status: 'pending',
    });
  });

  it('rechaza bloquear HH en una fase con bloques sin elegir el bloque', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({
      data: { ...data, segmentId: undefined }, actor, actorRole: 'collaborator',
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_SEGMENT_REQUIRED');
    expect(save).not.toHaveBeenCalled();
  });

  it('no acepta segmentId de otro módulo o proyecto', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({
      data: { ...data, segmentId: 'otro-bloque' }, actor, actorRole: 'collaborator',
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_SEGMENT_NOT_IN_MODULE');
    expect(save).not.toHaveBeenCalled();
  });

  it('impide atribuir horas a un equipo ajeno incluso con UUID válido', async () => {
    const { useCase, save, projects } = setup();
    projects.isUserOnSegmentTeam.mockResolvedValue(false);
    const result = await useCase.execute({ data, actor, actorRole: 'collaborator' });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_INVALID_SEGMENT');
    expect(save).not.toHaveBeenCalled();
  });

  it('permite registros sin módulo de proyectos que todavía no tienen Roadmap', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({
      data: { ...data, moduleId: undefined, segmentId: undefined },
      actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(save.mock.calls[0]![0].toSnapshot()).toMatchObject({
      projectId: 'project-1', moduleId: null, segmentId: null,
    });
  });
});

import type { CreateHourEntryInput, ProjectStatus, RoleCode, UserStatus } from '@kora/contracts';
import { FixedClock, RecordingAuditRecorder, SequentialIdGenerator } from '../../../../test/fakes';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const ACTOR = { userId: 'collab-1', email: 'collab@kabeli.cl' };

const INPUT = {
  assignment: 'Proyecto',
  projectId: 'project-1',
  category: 'Desarrollo',
  description: '',
  hours: 4,
  date: '2026-10-20',
  isOvertime: false,
  hasBlocker: false,
} as CreateHourEntryInput;

function buildUseCase(projectStatus: ProjectStatus, regularHoursForDate = 0, ownerRole: RoleCode = 'collaborator', ownerStatus: UserStatus = 'active') {
  const entries = {
    save: vi.fn().mockResolvedValue(undefined),
    sumApprovedHoursForProject: vi.fn().mockResolvedValue(0),
    sumRegularHoursForUserAndDate: vi.fn().mockResolvedValue(regularHoursForDate),
  } as unknown as HourEntryRepository;
  const users = {
    findById: vi.fn().mockResolvedValue({ id: 'collab-1', role: ownerRole, status: ownerStatus }),
  } as unknown as HourEntryUserReader;
  const projects = {
    findById: vi.fn().mockResolvedValue({
      id: 'project-1',
      name: 'Proyecto',
      status: projectStatus,
      leaderUserId: null,
      allowsOvertime: false,
    }),
    recalculateUsedHours: vi.fn().mockResolvedValue(undefined),
    hasAttributableWorkBlocks: vi.fn().mockResolvedValue(false),
  } as unknown as HourEntryProjectReader;

  const useCase = new CreateHourEntryUseCase(
    entries,
    users,
    projects,
    new RecordingAuditRecorder(),
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
  return { useCase, entries };
}

describe('CreateHourEntryUseCase', () => {
  it.each(['finished', 'cancelled'] as const)('no permite cargar horas en un proyecto %s', async (status) => {
    const { useCase, entries } = buildUseCase(status);

    const result = await useCase.execute({ data: INPUT, actor: ACTOR, actorRole: 'collaborator' });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_PROJECT_CLOSED');
    expect(entries.save).not.toHaveBeenCalled();
  });

  it('rechaza nuevas horas para un usuario deshabilitado, aun cuando las registre un administrador', async () => {
    const { useCase, entries } = buildUseCase('active', 0, 'collaborator', 'disabled');

    const result = await useCase.execute({
      data: { ...INPUT, userId: 'collab-1' },
      actor: { userId: 'admin-1', email: 'admin@kabeli.cl' },
      actorRole: 'admin',
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_OWNER_DISABLED');
    expect(entries.save).not.toHaveBeenCalled();
  });

  it('permite cargar horas en un proyecto activo', async () => {
    const { useCase, entries } = buildUseCase('active');

    const result = await useCase.execute({ data: INPUT, actor: ACTOR, actorRole: 'collaborator' });

    expect(result.isOk()).toBe(true);
    expect(entries.save).toHaveBeenCalled();
  });

  it('lo que pase de las 8h normales del día queda como un segundo registro de horas extra', async () => {
    // Proyecto sin horas extra autorizadas: el excedente automático no la exige.
    const { useCase, entries } = buildUseCase('active', 6);

    const result = await useCase.execute({ data: { ...INPUT, hours: 5 }, actor: ACTOR, actorRole: 'collaborator' });

    expect(result.isOk()).toBe(true);
    const saved = vi.mocked(entries.save).mock.calls.map(([entry]) => ({ hours: entry.hours, isOvertime: entry.isOvertime }));
    expect(saved).toEqual([
      { hours: 2, isOvertime: false },
      { hours: 3, isOvertime: true },
    ]);
  });

  it('con la jornada ya completa, todo queda como horas extra', async () => {
    const { useCase, entries } = buildUseCase('active', 8);

    const result = await useCase.execute({ data: INPUT, actor: ACTOR, actorRole: 'collaborator' });

    expect(result.isOk()).toBe(true);
    const saved = vi.mocked(entries.save).mock.calls.map(([entry]) => ({ hours: entry.hours, isOvertime: entry.isOvertime }));
    expect(saved).toEqual([{ hours: 4, isOvertime: true }]);
  });

  it('las horas extra de un líder también se autoaprueban', async () => {
    const { useCase, entries } = buildUseCase('active', 6, 'leader');

    const result = await useCase.execute({ data: { ...INPUT, hours: 5 }, actor: ACTOR, actorRole: 'leader' });

    expect(result.isOk()).toBe(true);
    const saved = vi.mocked(entries.save).mock.calls.map(([entry]) => ({ isOvertime: entry.isOvertime, status: entry.status }));
    expect(saved).toEqual([
      { isOvertime: false, status: 'approved' },
      { isOvertime: true, status: 'approved' },
    ]);
  });

  it('las horas extra de PMO siguen quedando pendientes', async () => {
    const { useCase, entries } = buildUseCase('active', 6, 'pmo');

    const result = await useCase.execute({ data: { ...INPUT, hours: 5 }, actor: ACTOR, actorRole: 'pmo' });

    expect(result.isOk()).toBe(true);
    const saved = vi.mocked(entries.save).mock.calls.map(([entry]) => ({ isOvertime: entry.isOvertime, status: entry.status }));
    expect(saved).toEqual([
      { isOvertime: false, status: 'approved' },
      { isOvertime: true, status: 'pending' },
    ]);
  });
});
