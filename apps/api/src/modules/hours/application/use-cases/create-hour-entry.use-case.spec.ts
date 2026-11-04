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
  isOvertime: false,
  hasBlocker: false,
};

function setup() {
  const save = vi.fn().mockResolvedValue(undefined);
  const projects = {
    findById: vi.fn().mockResolvedValue({ id: 'project-1', status: 'active', allowsOvertime: true }),
    findModuleById: vi.fn().mockResolvedValue({
      id: 'module-1', name: 'Fase', projectId: 'project-1',
    }),
    findSegmentsForModule: vi.fn().mockResolvedValue([
      { id: 'segment-1', moduleId: 'module-1', projectId: 'project-1', teamId: 'team-1', name: 'Bloque' },
    ]),
    isUserOnSegmentTeam: vi.fn().mockResolvedValue(true),
  };
  const useCase = new CreateHourEntryUseCase(
    { save, sumApprovedHoursForProject: vi.fn() } as unknown as HourEntryRepository,
    { findById: vi.fn().mockResolvedValue({ id: 'worker-1', role: 'collaborator' }) } as unknown as HourEntryUserReader,
    projects as unknown as HourEntryProjectReader,
    { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder,
    { now: () => new Date('2026-11-04T12:00:00.000Z') },
    { generate: () => 'entry-1' },
  );
  return { useCase, save, projects };
}

describe('imputación verificable de HH a un bloque de trabajo', () => {
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
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_INVALID_SEGMENT');
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
