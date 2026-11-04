import { describe, expect, it, vi } from 'vitest';
import { HourEntry } from '../../domain/entities/hour-entry.entity';
import type { HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type { HourEntryUserReader } from '../ports/hour-entry-user-reader.port';
import type { HourEntryProjectReader } from '../ports/hour-entry-project-reader.port';
import type { HourEntryApprovalAuthorityService } from '../services/hour-entry-approval-authority.service';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { UpdateHourEntryUseCase } from './update-hour-entry.use-case';

const actor = { userId: 'worker-1', email: 'worker@example.com' };

function setup() {
  const result = HourEntry.create({
    id: 'entry-1', userId: 'worker-1', assignment: 'Proyecto',
    projectId: 'project-1', moduleId: 'module-1', segmentId: 'segment-1',
    hours: 4, date: new Date('2026-11-04T00:00:00Z'),
    ownerRequiresApproval: true, now: new Date('2026-11-04T12:00:00Z'),
  });
  if (!result.isOk()) throw new Error('Fallo fixture');
  const entry = result.value;
  const save = vi.fn().mockResolvedValue(undefined);
  const projects = {
    findModuleById: vi.fn().mockResolvedValue({ id: 'module-1', projectId: 'project-1' }),
    findSegmentsForModule: vi.fn().mockResolvedValue([
      { id: 'segment-1', projectId: 'project-1', moduleId: 'module-1', teamId: 'team-1' },
      { id: 'segment-2', projectId: 'project-1', moduleId: 'module-1', teamId: 'team-1' },
    ]),
    isUserOnSegmentTeam: vi.fn().mockResolvedValue(true),
    hasAttributableWorkBlocks: vi.fn().mockResolvedValue(true),
  };
  const useCase = new UpdateHourEntryUseCase(
    { findById: vi.fn().mockResolvedValue(entry), save,
      sumApprovedHoursForProject: vi.fn() } as unknown as HourEntryRepository,
    { canDecide: vi.fn().mockResolvedValue(false) } as unknown as HourEntryApprovalAuthorityService,
    { findById: vi.fn().mockResolvedValue({ role: 'collaborator' }) } as unknown as HourEntryUserReader,
    projects as unknown as HourEntryProjectReader,
    { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder,
    { now: () => new Date('2026-11-04T16:00:00Z') },
  );
  return { useCase, entry, save, projects };
}

describe('edición de horas y atribución a bloque', () => {
  it('puede corregir una imputación aún pendiente sin modificar su número de horas', async () => {
    const { useCase, entry, save } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1', data: { segmentId: 'segment-2' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isOk()).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(entry.toSnapshot()).toMatchObject({
      segmentId: 'segment-2', moduleId: 'module-1', hours: 4,
    });
  });

  it('no permite trasladar las HH a un bloque ajeno', async () => {
    const { useCase, save } = setup();
    const result = await useCase.execute({
      entryId: 'entry-1', data: { segmentId: 'segment-foreign' },
      actor, actorRole: 'collaborator',
    });
    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error.code).toBe('HOUR_ENTRY_INVALID_SEGMENT');
    expect(save).not.toHaveBeenCalled();
  });
});
