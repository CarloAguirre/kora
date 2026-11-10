import { describe, expect, it } from 'vitest';
import type { ProjectSummary, ProjectPhaseOption } from '@kora/contracts';
import { type DailyBlock, matchesTaskHourTarget, remainingRegularHoursForBlock, selectAttributableTasks, validateDailyBlock } from './DailyEntryForm';

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

describe('jornada diaria y horas extra autorizadas', () => {
  const withoutOvertime = {
    ...context, projects: [{ id: 'project-1', allowsOvertime: false } as unknown as ProjectSummary],
  };
  it('rechaza el excedente automático aunque el switch de extra esté desmarcado', () => {
    expect(validateDailyBlock({ ...base, hours: '9.25' }, {
      ...withoutOvertime, exceedsDailyCap: true,
    })).toBe('Este proyecto no tiene autorizadas horas extra.');
  });
  it('permite el excedente cuando el proyecto autoriza horas extra', () => {
    expect(validateDailyBlock({ ...base, hours: '9.25' }, {
      ...context, exceedsDailyCap: true,
    })).toBeNull();
  });
  it('calcula el máximo permitido descontando registros anteriores del día', () => {
    const first = { ...base, key: 'first', hours: '3' };
    const second = { ...base, key: 'second', hours: '9.25' };
    expect(remainingRegularHoursForBlock(2, [first, second], 'second')).toBe(3);
    expect(remainingRegularHoursForBlock(8, [first, second], 'second')).toBe(0);
    expect(remainingRegularHoursForBlock(0, [second], 'second')).toBe(8);
  });
});

describe('registro diario: imputación por bloque del Roadmap', () => {
  it('ofrece sólo tareas propias, del bloque elegido y no canceladas', () => {
    const tasks = [
      { id: 'a', name: 'Mía', assigneeUserId: 'worker-1', segmentId: 'block-1', teamId: 'team-1', cancelledAt: null },
      { id: 'b', name: 'Ajena', assigneeUserId: 'worker-2', segmentId: 'block-1', teamId: 'team-1', cancelledAt: null },
      { id: 'c', name: 'Otro bloque', assigneeUserId: 'worker-1', segmentId: 'block-2', teamId: 'team-1', cancelledAt: null },
      { id: 'd', name: 'Cancelada', assigneeUserId: 'worker-1', segmentId: 'block-1', teamId: 'team-1',
        cancelledAt: '2026-11-04T12:00:00.000Z' },
    ];
    expect(selectAttributableTasks(tasks, 'worker-1', 'block-1').map((task) => task.id)).toEqual(['a']);
    expect(selectAttributableTasks(tasks, undefined, 'block-1')).toEqual([]);
  });

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

  it('exige selección consciente de la tarea u Otro si existen tareas del colaborador en el bloque', () => {
    const selected = { ...base, moduleId: 'module-1', segmentId: 'segment-1',
      roadmapNeedsPhase: true, roadmapNeedsSegment: true, roadmapNeedsTask: true };
    expect(validateDailyBlock(selected, context)).toBe('Selecciona una tarea o «Otro trabajo del bloque».');
    expect(validateDailyBlock({ ...selected, taskId: 'task-1', category: 'Modelo de datos' }, context))
      .toBeNull();
    expect(validateDailyBlock({ ...selected, taskId: '__other__', category: 'Reunión de seguimiento' }, context))
      .toBeNull();
    expect(validateDailyBlock({ ...selected, taskId: '__other__', category: '' }, context))
      .toBe('Indica la actividad realizada.');
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

describe('registro diario desde completar tarea: consistencia de IDs', () => {
  const target = {
    projectId: 'project-1', moduleId: 'phase-1',
    taskId: 'task-1', taskTitle: 'Revisar diseño',
  };
  const selection: DailyBlock = { ...base, moduleId: target.moduleId,
    segmentId: 'segment-1', taskId: target.taskId, category: 'Revisar diseño' };
  const phases = [{
    id: target.moduleId, tasks: [{
      id: target.taskId, segmentId: 'segment-1',
      assigneeUserId: 'collaborator-1', cancelledAt: null,
    }],
  }] as unknown as ProjectPhaseOption[];

  it('solo permite guardar la tarea propia en la fase y bloque correctos', () => {
    expect(matchesTaskHourTarget([selection], target, phases, 'collaborator-1')).toBe(true);
    expect(matchesTaskHourTarget([selection], target, undefined, 'collaborator-1')).toBe(false);
    expect(matchesTaskHourTarget([selection], target, phases, 'another-user')).toBe(false);
    expect(matchesTaskHourTarget([{ ...selection, segmentId: 'other-segment' }], target,
      phases, 'collaborator-1')).toBe(false);
    expect(matchesTaskHourTarget([{ ...selection, taskId: 'other-task' }], target,
      phases, 'collaborator-1')).toBe(false);
    expect(matchesTaskHourTarget([selection, selection], target, phases,
      'collaborator-1')).toBe(false);
    expect(matchesTaskHourTarget([{ ...selection, assignment: 'Capacitación' }], target,
      phases, 'collaborator-1')).toBe(false);
  });

  it('no permite registrar HH para una tarea cancelada, ni para un bloque cambiado', () => {
    const cancelled = [{
      ...phases[0]!, tasks: [{ ...phases[0]!.tasks[0]!, cancelledAt: '2026-11-05T00:00:00.000Z' }],
    }] as ProjectPhaseOption[];
    expect(matchesTaskHourTarget([selection], target, cancelled, 'collaborator-1')).toBe(false);
    expect(matchesTaskHourTarget([{ ...selection, projectId: 'other-project' }],
      target, phases, 'collaborator-1')).toBe(false);
  });
});
