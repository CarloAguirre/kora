import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '@kora/core';
import type { ProjectHourEntryReader } from '../ports/project-hour-entry-reader.port';
import { CollaboratorProjectActivityService } from './collaborator-project-activity.service';

function setup() {
  const reader = {
    weeklyHoursByProjectForUser: vi.fn().mockResolvedValue([
      { projectId: 'project-a', hours: 8 }, { projectId: 'project-b', hours: 2 },
    ]),
    approvedProjectEvents: vi.fn().mockResolvedValue({
      truncated: false,
      entries: [{
        id: 'hour-a', date: new Date('2026-11-04T00:00:00Z'),
        createdAt: new Date('2026-11-04T14:30:00Z'),
        userName: 'Colaborador', moduleName: 'Fase 1',
        activity: 'Desarrollo', description: 'Maquetación',
        hours: 8, hasBlocker: false, blockerDescription: null,
      }],
    }),
  } as unknown as ProjectHourEntryReader;
  const clock = { now: () => new Date('2026-11-05T17:00:00Z') } as Clock;
  return { service: new CollaboratorProjectActivityService(reader, clock), reader };
}

describe('CollaboratorProjectActivityService', () => {
  it('calcula solo HH de la propia persona y de los proyectos solicitados en la semana vigente', async () => {
    const { service, reader } = setup();
    const map = await service.weeklyHours('actor-1', ['project-a', 'project-b']);
    expect(map.get('project-a')).toBe(8);
    expect(reader.weeklyHoursByProjectForUser).toHaveBeenCalledWith(
      'actor-1', ['project-a', 'project-b'],
      new Date('2026-11-02T00:00:00Z'), new Date('2026-11-08T00:00:00Z'),
    );
  });

  it('retorna solo eventos aprobados con datos de lectura y fecha ISO', async () => {
    const { service, reader } = setup();
    const result = await service.approvedEvents('project-a');
    expect(reader.approvedProjectEvents).toHaveBeenCalledWith('project-a', 500);
    expect(result.entries).toEqual([expect.objectContaining({
      date: '2026-11-04', userName: 'Colaborador', hours: 8,
    })]);
    expect(result.truncated).toBe(false);
  });

  it('evita consultar base cuando no hay proyectos', async () => {
    const { service, reader } = setup();
    expect((await service.weeklyHours('actor-1', [])).size).toBe(0);
    expect(reader.weeklyHoursByProjectForUser).not.toHaveBeenCalled();
  });
});
