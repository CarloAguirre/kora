import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '@kora/contracts';
import { validateDailyBlock, type DailyBlock } from './DailyEntryForm';

const block: DailyBlock = {
  key: 'b-1', expanded: true, assignment: 'Proyecto', projectId: 'p-1',
  moduleId: '', segmentId: '', taskId: '',
  roadmapNeedsPhase: true, roadmapNeedsSegment: true, roadmapNeedsTask: true,
  category: 'Desarrollo', description: '', hours: '2', isOvertime: false,
  designatedApproverUserId: '', hasBlocker: false, blockerDescription: '',
};

const project = (date: string) => ({
  id: 'p-1', status: 'active', type: 'development', salesStage: 'approved',
  startDate: date, createdAt: '2026-10-15T00:00:00Z', allowsOvertime: false,
} as ProjectSummary);

describe('validación de horas según fecha de inicio de proyecto', () => {
  it('legacy permite registrar HH sin fase/bloque/tarea', () => {
    expect(validateDailyBlock(block, {
      projects: [project('2026-11-10')], isCollaborator: true,
    })).toBeNull();
  });
  it('11-11 mantiene obligatoriedad de fase cuando hay bloques', () => {
    expect(validateDailyBlock(block, {
      projects: [project('2026-11-11')], isCollaborator: true,
    })).toMatch(/fase y su bloque/i);
  });
});
