import { describe, expect, it, vi } from 'vitest';
import type { ProjectStatus, RoleCode } from '@kora/contracts';
import { UpdateHourEntryUseCase } from './update-hour-entry.use-case';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import type { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import { FixedClock, RecordingAuditRecorder } from '../../../../test/fakes';

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

function buildUseCase(entry: HourEntry, statuses: Record<string, ProjectStatus>, options: { canDecide?: boolean } = {}) {
  const entries = {
    findById: vi.fn().mockResolvedValue(entry),
    save: vi.fn().mockResolvedValue(undefined),
    sumApprovedHoursForProject: vi.fn().mockResolvedValue(0),
  } as unknown as HourEntryRepository;
  const users = {
    findById: vi.fn().mockResolvedValue({ id: 'collab-1', role: 'collaborator', status: 'active' }),
  } as unknown as HourEntryUserReader;
  const projects = {
    findById: vi.fn(async (id: string) =>
      statuses[id] ? { id, name: id, status: statuses[id], leaderUserId: null, allowsOvertime: false } : null,
    ),
    recalculateUsedHours: vi.fn().mockResolvedValue(undefined),
  } as unknown as HourEntryProjectReader;
  const authority = {
    canDecide: vi.fn().mockResolvedValue(options.canDecide ?? false),
  } as unknown as HourEntryApprovalAuthorityService;

  const useCase = new UpdateHourEntryUseCase(entries, authority, users, projects, new RecordingAuditRecorder(), new FixedClock(NOW));
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
});
