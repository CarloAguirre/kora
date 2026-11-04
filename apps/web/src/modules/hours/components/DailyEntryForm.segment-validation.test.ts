import { describe, expect, it } from 'vitest';
import type { ProjectSummary } from '@kora/contracts';
import { type DailyBlock, validateDailyBlock } from './DailyEntryForm';

const base: DailyBlock = {
  key: 'hh-1', expanded: true, assignment: 'Proyecto', projectId: 'project-1',
  moduleId: '', segmentId: '', category: 'Implementación', hours: '4',
  description: 'Implementación del flujo', isOvertime: false,
  designatedApproverUserId: '', hasBlocker: false, blockerDescription: '',
};

const context = {
  projects: [{ id: 'project-1', allowsOvertime: true } as unknown as ProjectSummary],
  isCollaborator: true,
};

describe('registro diario: imputación por bloque del Roadmap', () => {
  it('exige fase cuando la persona pertenece a un equipo con bloques', () => {
    expect(validateDailyBlock({ ...base, roadmapNeedsPhase: true }, context))
      .toBe('Selecciona una fase y su bloque de trabajo para imputar estas horas.');
  });

  it('exige bloque cuando el módulo tiene bloques para el equipo', () => {
    expect(validateDailyBlock({ ...base, moduleId: 'module-1', roadmapNeedsPhase: true, roadmapNeedsSegment: true }, context))
      .toBe('Selecciona el bloque al que corresponden estas HH.');
  });

  it('permite guardar una imputación atribuida a un bloque válido', () => {
    expect(validateDailyBlock({ ...base, moduleId: 'module-1', segmentId: 'segment-1',
      roadmapNeedsPhase: true, roadmapNeedsSegment: true }, context)).toBeNull();
  });

  it('permite HH generales cuando el colaborador no participa en el Roadmap', () => {
    expect(validateDailyBlock({ ...base, roadmapNeedsPhase: false,
      roadmapNeedsSegment: false }, context)).toBeNull();
  });

  it('no exige bloque para Prospecto ni para registros sin asignación de proyecto', () => {
    expect(validateDailyBlock({ ...base, assignment: 'Prospecto',
      roadmapNeedsPhase: true, roadmapNeedsSegment: true }, context)).toBeNull();
    expect(validateDailyBlock({ ...base, assignment: 'Capacitación', projectId: '',
      roadmapNeedsPhase: true, roadmapNeedsSegment: true }, context))
      .toBe('Selecciona a quién aprueba estas horas.');
  });
});
