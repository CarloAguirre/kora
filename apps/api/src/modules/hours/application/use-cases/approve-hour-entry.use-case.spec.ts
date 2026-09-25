import { describe, expect, it, vi } from 'vitest';
import { ApproveHourEntryUseCase } from './approve-hour-entry.use-case';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { TicketHhRequestSyncPort } from '../ports/ticket-hh-request-sync.port';
import type { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { FixedClock } from '../../../../test/fakes';

const NOW = new Date('2026-09-24T00:00:00.000Z');
const ACTOR = { userId: 'leader-1', email: 'leader@kabeli.cl' };

function buildEntry(overrides: { projectId?: string | null } = {}) {
  const hasProject = overrides.projectId !== null;
  return HourEntry.create({
    id: 'entry-1',
    userId: 'collab-1',
    assignment: hasProject ? 'Proyecto' : 'Vacaciones',
    projectId: overrides.projectId === undefined ? 'project-1' : overrides.projectId,
    designatedApproverUserId: hasProject ? undefined : 'leader-2',
    hours: 4,
    date: new Date('2026-09-20'),
    ownerRequiresApproval: true,
    now: NOW,
  }).unwrap();
}

function buildUseCase(entry: HourEntry, options: { canDecide?: boolean; usedHours?: number } = {}) {
  const entries = {
    findById: vi.fn().mockResolvedValue(entry),
    save: vi.fn().mockResolvedValue(undefined),
    sumApprovedHoursForProject: vi.fn().mockResolvedValue(options.usedHours ?? 12),
  } as unknown as HourEntryRepository;

  const projects = {
    recalculateUsedHours: vi.fn().mockResolvedValue(undefined),
  } as unknown as HourEntryProjectReader;

  const authority = {
    canDecide: vi.fn().mockResolvedValue(options.canDecide ?? true),
  } as unknown as HourEntryApprovalAuthorityService;

  const ticketSync = { onHourEntryApproved: vi.fn().mockResolvedValue(undefined) } as unknown as TicketHhRequestSyncPort;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;

  const useCase = new ApproveHourEntryUseCase(entries, authority, projects, ticketSync, audit, new FixedClock(NOW));
  return { useCase, entries, projects, ticketSync };
}

describe('ApproveHourEntryUseCase', () => {
  it('al aprobar una hora con proyecto, recalcula usedHours del proyecto', async () => {
    const entry = buildEntry();
    const { useCase, projects } = buildUseCase(entry, { usedHours: 16 });

    const result = await useCase.execute({ entryId: 'entry-1', actor: ACTOR, actorRole: 'leader' });

    expect(result.isOk()).toBe(true);
    expect(projects.recalculateUsedHours).toHaveBeenCalledWith('project-1', 16);
  });

  it('no recalcula nada si la hora no tiene proyecto asociado', async () => {
    const entry = buildEntry({ projectId: null });
    const { useCase, projects } = buildUseCase(entry);

    const result = await useCase.execute({ entryId: 'entry-1', actor: ACTOR, actorRole: 'leader' });

    expect(result.isOk()).toBe(true);
    expect(projects.recalculateUsedHours).not.toHaveBeenCalled();
  });

  it('no recalcula nada si el actor no puede aprobar', async () => {
    const entry = buildEntry();
    const { useCase, projects, entries } = buildUseCase(entry, { canDecide: false });

    const result = await useCase.execute({ entryId: 'entry-1', actor: ACTOR, actorRole: 'leader' });

    expect(result.isErr()).toBe(true);
    expect(entries.save).not.toHaveBeenCalled();
    expect(projects.recalculateUsedHours).not.toHaveBeenCalled();
  });
});
