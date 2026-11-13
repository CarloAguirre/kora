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

describe('validación de horas según planificación disponible (no fecha)', () => {
  it.each(['2026-11-10', '2026-11-11', '2026-11-13'])(
    'requiere fase con planificación incluso en proyecto iniciado el %s', (date) => {
      expect(validateDailyBlock(block, {
        projects: [project(date)], isCollaborator: true,
      })).toBe('Selecciona una fase para imputar estas horas.');
    },
  );

  it.each(['2026-11-10', '2026-11-11', '2026-11-13'])(
    'permite HH sin fase si el proyecto del %s no tiene fases', (date) => {
      expect(validateDailyBlock({
        ...block, roadmapNeedsPhase: false,
        roadmapNeedsSegment: false, roadmapNeedsTask: false,
      }, {
        projects: [project(date)], isCollaborator: true,
      })).toBeNull();
    },
  );
});
