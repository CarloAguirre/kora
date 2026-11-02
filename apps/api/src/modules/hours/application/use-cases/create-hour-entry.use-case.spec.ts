import { describe, expect, it, vi } from 'vitest';
import type { CreateHourEntryInput, ProjectStatus, RoleCode } from '@kora/contracts';
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

function buildUseCase(projectStatus: ProjectStatus, regularHoursForDate = 0, ownerRole: RoleCode = 'collaborator') {
  const entries = {
    save: vi.fn().mockResolvedValue(undefined),
    sumApprovedHoursForProject: vi.fn().mockResolvedValue(0),
    sumRegularHoursForUserAndDate: vi.fn().mockResolvedValue(regularHoursForDate),
  } as unknown as HourEntryRepository;
  const users = {
    findById: vi.fn().mockResolvedValue({ id: 'collab-1', role: ownerRole, status: 'active' }),
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

  it('rechaza nuevas horas para un usuario deshabilitado, aun cuando las registre un administrador', async () => {
    const { useCase, entries } = buildUseCase('active');
    const users = (useCase as unknown as { users: HourEntryUserReader }).users;
    vi.mocked(users.findById).mockResolvedValue({
      id: 'collab-1',
      fullName: 'Julio Andrés Alarcón Caballero',
      role: 'collaborator',
      status: 'disabled',
    });

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
