import { describe, expect, it, vi } from 'vitest';
import type { CreateHourEntryInput, ProjectStatus } from '@kora/contracts';
import { CreateHourEntryUseCase } from './create-hour-entry.use-case';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
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

function buildUseCase(projectStatus: ProjectStatus) {
  const entries = {
    save: vi.fn().mockResolvedValue(undefined),
    sumApprovedHoursForProject: vi.fn().mockResolvedValue(0),
  } as unknown as HourEntryRepository;
  const users = {
    findById: vi.fn().mockResolvedValue({ id: 'collab-1', role: 'collaborator', status: 'active' }),
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

  it('permite cargar horas en un proyecto activo', async () => {
    const { useCase, entries } = buildUseCase('active');

    const result = await useCase.execute({ data: INPUT, actor: ACTOR, actorRole: 'collaborator' });

    expect(result.isOk()).toBe(true);
    expect(entries.save).toHaveBeenCalled();
  });
});
