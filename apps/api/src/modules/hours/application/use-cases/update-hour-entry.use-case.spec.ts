import { describe, expect, it, vi } from 'vitest';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { UpdateHourEntryUseCase } from './update-hour-entry.use-case';

const actor = { userId: 'worker-1', email: 'worker@example.com' };

function setup(withPlan = true) {
  const result = HourEntry.create({
    id: 'entry-1', userId: 'worker-1', assignment: 'Proyecto',
    projectId: 'project-1',
    moduleId: withPlan ? 'module-1' : null,
    segmentId: withPlan ? 'segment-1' : null,
    taskId: withPlan ? 'task-1' : null,
    hours: 4, date: new Date('2026-11-04T00:00:00Z'),
    ownerRequiresApproval: true, now: new Date('2026-11-04T12:00:00Z'),
  });
  if (!result.isOk()) throw new Error('Fallo fixture');
  const entry = result.value;
  const save = vi.fn().mockResolvedValue(undefined);
  const projects = {
    findById: vi.fn().mockResolvedValue({ id: 'project-1', status: 'active', allowsOvertime: false }),
    findModuleById: vi.fn().mockResolvedValue({
      id: 'module-1', projectId: 'project-1',
      segments: [{ id: 'segment-1', name: 'Bloque 1' }, { id: 'segment-2', name: 'Bloque 2' }],
      tasks: [
        { id: 'task-1', segmentId: 'segment-1', assigneeUserId: 'worker-1', cancelledAt: null },
        { id: 'task-2', segmentId: 'segment-2', assigneeUserId: 'worker-1', cancelledAt: null },
        { id: 'task-3', segmentId: 'segment-1', assigneeUserId: 'other-user', cancelledAt: null },
      ],
    }),
    findSegmentsForModule: vi.fn().mockResolvedValue([
      { id: 'segment-1', projectId: 'project-1', moduleId: 'module-1', teamId: 'team-1' },
      { id: 'segment-2', projectId: 'project-1', moduleId: 'module-1', teamId: 'team-1' },
    ]),
    isUserOnSegmentTeam: vi.fn().mockResolvedValue(true),
    hasAttributableWorkBlocks: vi.fn().mockResolvedValue(true),
    hasProjectPhases: vi.fn().mockResolvedValue(true),
  };
  const useCase = new UpdateHourEntryUseCase(
    { findById: vi.fn().mockResolvedValue(entry), save,
      sumApprovedHoursForProject: vi.fn(),
      sumRegularHoursForUserAndDate: vi.fn().mockResolvedValue(0) } as unknown as HourEntryRepository,
    { canDecide: vi.fn().mockResolvedValue(false) } as unknown as HourEntryApprovalAuthorityService,
    { findById: vi.fn().mockResolvedValue({ role: 'collaborator' }) } as unknown as HourEntryUserReader,
    projects as unknown as HourEntryProjectReader,
    { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder,
    { now: () => new Date('2026-11-04T16:00:00Z') },
    new SequentialIdGenerator(),
  );
  return { useCase, entry, save, projects };
}

describe('edición de horas y atribución a bloque', () => {
  it('conserva editable un registro histórico sin fase aunque el proyecto tenga fases nuevas', async () => {
    const { useCase, entry, projects } = setup(false);
    projects.findById.mockResolvedValue({
      id: 'project-1', status: 'active', allowsOvertime: false,
      startDate: new Date('2026-10-01T00:00:00Z'),
    });
    const result = await useCase.execute({
      entryId: 'entry-1', data: { projectId: 'project-1', hours: 3 },
      actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(entry.toSnapshot()).toMatchObject({
      moduleId: null, segmentId: null, taskId: null, hours: 3,
    });
  });

  it('permite cambiar a una tarea propia de otro bloque sin forzar el bloque', async () => {
    const { useCase, entry } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1',
      data: { moduleId: 'module-1', segmentId: null, taskId: 'task-2' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(entry.toSnapshot()).toMatchObject({
      moduleId: 'module-1', segmentId: null, taskId: 'task-2',
    });
  });

  it('conserva taskId mientras cambian únicamente HH y descripción', async () => {
    const { useCase, entry } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1', data: { hours: 3, description: 'Trabajo corregido' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(entry.toSnapshot()).toMatchObject({ taskId: 'task-1', hours: 3 });
  });

  it('permite cambiar la atribución a una tarea válida de otro bloque', async () => {
    const { useCase, entry } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1', data: { segmentId: 'segment-2', taskId: 'task-2' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(entry.toSnapshot()).toMatchObject({ taskId: 'task-2', segmentId: 'segment-2' });
  });

  it('histórico: preserva atribuciones existentes y permite reasignar a otra tarea propia', async () => {
    const { useCase, entry, projects, save } = setup();
    projects.findById.mockResolvedValue({
      id: 'project-1', status: 'active', allowsOvertime: false,
      startDate: new Date('2026-03-30T00:00:00Z'),
    });
    const okResult = await useCase.execute({
      entryId: 'entry-1', data: { description: 'Corrección de HH históricas' },
      actor, actorRole: 'collaborator',
    });
    expect(okResult.isOk()).toBe(true);
    expect(entry.toSnapshot().segmentId).toBe('segment-1');
    const relinked = await useCase.execute({
      entryId: 'entry-1', data: { segmentId: 'segment-2', taskId: 'task-2' },
      actor, actorRole: 'collaborator',
    });
    expect(relinked.isOk()).toBe(true);
    expect(entry.toSnapshot()).toMatchObject({ segmentId: 'segment-2', taskId: 'task-2' });
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('no permite vincular una tarea ajena al autor', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1', data: { taskId: 'task-3' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_TASK_INVALID');
    expect(save).not.toHaveBeenCalled();
  });

  it('puede corregir una imputación aún pendiente sin modificar su número de horas', async () => {
    const { useCase, entry, save } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1', data: { segmentId: 'segment-2' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(entry.toSnapshot()).toMatchObject({
      segmentId: 'segment-2', taskId: null, moduleId: 'module-1', hours: 4,
    });
  });

  it('no permite trasladar las HH a un bloque ajeno', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1', data: { segmentId: 'segment-foreign' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_SEGMENT_NOT_IN_MODULE');
    expect(save).not.toHaveBeenCalled();
  });
});

import type { ProjectStatus, RoleCode } from '@kora/contracts';
import { FixedClock, RecordingAuditRecorder, SequentialIdGenerator } from '../../../../test/fakes';

const NOW = new Date('2026-10-21T12:00:00.000Z');

function buildEntry(date: string) {
  return HourEntry.create({
    id: 'entry-1',
    userId: 'collab-1',
    assignment: 'Proyecto',
    projectId: 'project-1',
    category: 'Desarrollo',
    hours: 4,
    date: new Date(date),
    ownerRequiresApproval: true,
    now: new Date(`${date}T12:00:00.000Z`),
  }).unwrap();
}

function buildUseCase(
  entry: HourEntry,
  statuses: Record<string, ProjectStatus>,
  options: { canDecide?: boolean; regularHoursForDate?: number; allowsOvertime?: boolean } = {},
) {
  const entries = {
    findById: vi.fn().mockResolvedValue(entry),
    save: vi.fn().mockResolvedValue(undefined),
    sumApprovedHoursForProject: vi.fn().mockResolvedValue(0),
    sumRegularHoursForUserAndDate: vi.fn().mockResolvedValue(options.regularHoursForDate ?? 0),
  } as unknown as HourEntryRepository;
  const users = {
    findById: vi.fn().mockResolvedValue({ id: 'collab-1', role: 'collaborator', status: 'active' }),
  } as unknown as HourEntryUserReader;
  const projects = {
    findById: vi.fn(async (id: string) =>
      statuses[id] ? { id, name: id, status: statuses[id], leaderUserId: null, allowsOvertime: options.allowsOvertime ?? false } : null,
    ),
    recalculateUsedHours: vi.fn().mockResolvedValue(undefined),
    hasAttributableWorkBlocks: vi.fn().mockResolvedValue(false),
  } as unknown as HourEntryProjectReader;
  const authority = {
    canDecide: vi.fn().mockResolvedValue(options.canDecide ?? false),
  } as unknown as HourEntryApprovalAuthorityService;

  const useCase = new UpdateHourEntryUseCase(
    entries,
    authority,
    users,
    projects,
    new RecordingAuditRecorder(),
    new FixedClock(NOW),
    new SequentialIdGenerator(),
  );
  return { useCase, entries };
}

const OWNER = { userId: 'collab-1', email: 'collab@kabeli.cl' };
const BOSS = { userId: 'boss-1', email: 'boss@kabeli.cl' };

describe('UpdateHourEntryUseCase', () => {
  it.each(['admin', 'pmo'] as const)('%s edita un registro de un mes cerrado', async (role: RoleCode) => {
    const { useCase, entries } = buildUseCase(buildEntry('2026-09-20'), { 'project-1': 'active' }, { canDecide: true });

    const result = await useCase.execute({ entryId: 'entry-1', data: { hours: 6 }, actor: BOSS, actorRole: role });

    expect(result.isOk()).toBe(true);
    expect(entries.save).toHaveBeenCalled();
  });

  it('el dueño no edita un registro de un mes cerrado', async () => {
    const { useCase, entries } = buildUseCase(buildEntry('2026-09-20'), { 'project-1': 'active' });

    const result = await useCase.execute({ entryId: 'entry-1', data: { hours: 6 }, actor: OWNER, actorRole: 'collaborator' });

    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_OUTSIDE_CURRENT_MONTH');
    expect(entries.save).not.toHaveBeenCalled();
  });

  it('no permite mover un registro a un proyecto finalizado', async () => {
    const { useCase, entries } = buildUseCase(buildEntry('2026-10-20'), { 'project-1': 'active', 'project-2': 'finished' });

    const result = await useCase.execute({
      entryId: 'entry-1',
      data: { projectId: 'project-2' },
      actor: OWNER,
      actorRole: 'collaborator',
    });

    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_PROJECT_CLOSED');
    expect(entries.save).not.toHaveBeenCalled();
  });

  it('permite corregir un registro cuyo proyecto ya se finalizó', async () => {
    const { useCase, entries } = buildUseCase(buildEntry('2026-10-20'), { 'project-1': 'finished' });

    const result = await useCase.execute({
      entryId: 'entry-1',
      data: { projectId: 'project-1', hours: 6 },
      actor: OWNER,
      actorRole: 'collaborator',
    });

    expect(result.isOk()).toBe(true);
    expect(entries.save).toHaveBeenCalled();
  });

  it('no permite aumentar a más de 8h al editar un proyecto sin extras autorizadas', async () => {
    const { useCase, entries } = buildUseCase(buildEntry('2026-10-20'), { 'project-1': 'active' }, { regularHoursForDate: 5 });
    const result = await useCase.execute({
      entryId: 'entry-1', data: { hours: 6 }, actor: OWNER, actorRole: 'collaborator',
    });
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_PROJECT_OVERTIME_NOT_ALLOWED');
    expect(entries.save).not.toHaveBeenCalled();
  });

  it('no permite convertir la entrada en extra si la jornada ya está completa', async () => {
    const { useCase, entries } = buildUseCase(buildEntry('2026-10-20'), { 'project-1': 'active' }, { regularHoursForDate: 8 });
    const result = await useCase.execute({
      entryId: 'entry-1', data: { hours: 2 }, actor: OWNER, actorRole: 'collaborator',
    });
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_PROJECT_OVERTIME_NOT_ALLOWED');
    expect(entries.save).not.toHaveBeenCalled();
  });

  it('si con la edición el día pasa de 8h normales, el excedente queda como un registro de horas extra', async () => {
    // Sólo se divide en horas extra si el proyecto lo autoriza.
    const { useCase, entries } = buildUseCase(buildEntry('2026-10-20'), { 'project-1': 'active' }, { regularHoursForDate: 5, allowsOvertime: true });

    const result = await useCase.execute({ entryId: 'entry-1', data: { hours: 6 }, actor: OWNER, actorRole: 'collaborator' });

    expect(result.isOk()).toBe(true);
    const saved = vi.mocked(entries.save).mock.calls.map(([entry]) => ({ hours: entry.hours, isOvertime: entry.isOvertime }));
    expect(saved).toEqual([
      { hours: 3, isOvertime: false },
      { hours: 3, isOvertime: true },
    ]);
  });

  it('con la jornada ya completa, el registro editado pasa entero a horas extra', async () => {
    const { useCase, entries } = buildUseCase(buildEntry('2026-10-20'), { 'project-1': 'active' }, { regularHoursForDate: 8, allowsOvertime: true });

    const result = await useCase.execute({ entryId: 'entry-1', data: { hours: 2 }, actor: OWNER, actorRole: 'collaborator' });

    expect(result.isOk()).toBe(true);
    const saved = vi.mocked(entries.save).mock.calls.map(([entry]) => ({ hours: entry.hours, isOvertime: entry.isOvertime }));
    expect(saved).toEqual([{ hours: 2, isOvertime: true }]);
  });
});
