import { describe, expect, it, vi } from 'vitest';
import type { RoleCode } from '@kora/contracts';
import { DeleteHourEntryUseCase } from './delete-hour-entry.use-case';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import { FixedClock, RecordingAuditRecorder } from '../../../../test/fakes';

const NOW = new Date('2026-10-21T12:00:00.000Z');

/** Registro pendiente de septiembre: fuera del mes en curso. */
function buildEntry() {
  return HourEntry.create({
    id: 'entry-1',
    userId: 'collab-1',
    assignment: 'Proyecto',
    projectId: 'project-1',
    hours: 4,
    date: new Date('2026-09-20'),
    ownerRequiresApproval: true,
    now: new Date('2026-09-20T12:00:00.000Z'),
  }).unwrap();
}

function buildUseCase(entry: HourEntry) {
  const entries = {
    findById: vi.fn().mockResolvedValue(entry),
    delete: vi.fn().mockResolvedValue(undefined),
    sumApprovedHoursForProject: vi.fn().mockResolvedValue(0),
  } as unknown as HourEntryRepository;
  const projects = { recalculateUsedHours: vi.fn().mockResolvedValue(undefined) } as unknown as HourEntryProjectReader;
  const authority = { canDecide: vi.fn().mockResolvedValue(false) } as unknown as HourEntryApprovalAuthorityService;

  const useCase = new DeleteHourEntryUseCase(entries, authority, projects, new RecordingAuditRecorder(), new FixedClock(NOW));
  return { useCase, entries };
}

describe('DeleteHourEntryUseCase', () => {
  it.each(['admin', 'pmo'] as const)('%s elimina un registro de un mes cerrado', async (role: RoleCode) => {
    const { useCase, entries } = buildUseCase(buildEntry());

    const result = await useCase.execute({ entryId: 'entry-1', actor: { userId: 'boss-1', email: 'boss@kabeli.cl' }, actorRole: role });

    expect(result.isOk()).toBe(true);
    expect(entries.delete).toHaveBeenCalledWith('entry-1');
  });

  it('el dueño no elimina un registro de un mes cerrado', async () => {
    const { useCase, entries } = buildUseCase(buildEntry());

    const result = await useCase.execute({
      entryId: 'entry-1',
      actor: { userId: 'collab-1', email: 'collab@kabeli.cl' },
      actorRole: 'collaborator',
    });

    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_OUTSIDE_CURRENT_MONTH');
    expect(entries.delete).not.toHaveBeenCalled();
  });
});
