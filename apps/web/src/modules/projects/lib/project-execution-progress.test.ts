import { describe, expect, it } from 'vitest';
import type { ProjectDetail, ProjectModuleTask } from '@kora/contracts';
import { calculateProjectExecutionProgress } from './project-execution-progress';

const today = '2026-11-04';
const teamRpa = 'team-rpa';
const teamQa = 'team-qa';
const teamPmo = 'team-pmo';
const segment = (id: string, teamId: string, name: string, estimatedHours: number | null,
  closedAt: string | null = null) => ({
  id, teamId, teamName: teamId.replace('team-', '').toUpperCase(), name,
  startDate: '2026-09-07', endDate: '2026-10-30',
  estimatedHours, closedAt, consumedHours: 0, members: [],
});
const task = (id: string, teamId: string, segmentId: string | null,
  status: 'todo' | 'done' | 'in_review', estimatedHours: number, cancelledAt: string | null = null): ProjectModuleTask => ({
  id, teamId, teamName: teamId.replace('team-', '').toUpperCase(),
  segmentId, segmentName: null,
  assigneeUserId: null, assigneeName: null,
  name: id, description: null,
  startDate: '2026-10-15', date: '2026-10-15',
  status, scope: 'desarrollo', estimatedHours,
  completedAt: null, cancelledAt, rejectionReason: null,
});

function fixture(): ProjectDetail {
  return {
    status: 'active', stopsClock: false,
    soldHours: 606.5, usedHours: 273.5,
    teams: [
      { teamId: teamRpa, assignedHours: 461 },
      { teamId: teamQa, assignedHours: 110 },
      { teamId: teamPmo, assignedHours: 36 },
    ],
    members: [],
    modules: [
      {
        id: 'phase-1', name: 'Bot de conciliación', estimatedHours: 464,
        segments: [
          segment('pmo-1', teamPmo, 'Bot de conciliación PMO', 24, '2026-10-16T18:00:00Z'),
          segment('qa-1', teamQa, 'Bot de conciliación QA', 80),
          segment('rpa-1', teamRpa, 'Bot de conciliación RPA', 360, '2026-10-16T18:00:00Z'),
        ],
        deliveries: [{ id: 'approved-qa', segmentId: 'qa-1', status: 'approved' }],
        tasks: [
          task('pmo-closed', teamPmo, 'pmo-1', 'todo', 24),
          task('qa-approved-delivery', teamQa, 'qa-1', 'todo', 80),
          task('rpa-closed', teamRpa, 'rpa-1', 'todo', 360),
        ],
      },
      {
        id: 'phase-2', name: 'Reportería', estimatedHours: 143,
        segments: [
          segment('pmo-2', teamPmo, 'Reportería PMO', 12),
          segment('qa-2', teamQa, 'Reportería QA', 30),
          segment('rpa-2', teamRpa, 'Reportería RPA', 101),
        ],
        deliveries: [],
        tasks: [
          task('pmo-todo', teamPmo, 'pmo-2', 'todo', 12),
          task('qa-todo', teamQa, 'qa-2', 'todo', 30),
          task('rpa-todo', teamRpa, 'rpa-2', 'todo', 101),
        ],
      },
    ],
  } as unknown as ProjectDetail;
}

describe('Avance global por los mismos bloques que el avance del equipo', () => {
  it('suma HH completadas y planificadas de todos los bloques, nunca porcentajes', () => {
    const progress = calculateProjectExecutionProgress(fixture(), today);
    expect(progress.hasPlan).toBe(true);
    expect(progress.plannedHours).toBe(607);
    expect(progress.actualHours).toBe(464);
    expect(progress.expectedHours).toBe(607);
    expect(progress.actualPercent).toBe(76);
    expect(progress.expectedPercent).toBe(100);
    expect(progress.blocksCount).toBe(6);
    expect(progress.taskCount).toBe(6);
    expect(progress.phases.map((phase) => phase.actualHours)).toEqual([464, 0]);
    expect(progress.laggingBlocks.map((block) => [block.id, block.gapPoints]))
      .toEqual([['rpa-2', 17], ['qa-2', 5], ['pmo-2', 2]]);
    // Ni la estimación vendida (606,5) ni el consumo (273,5) alteran la barra.
    expect(progress.soldHours).toBe(606.5);
    expect(progress.usedHours).toBe(273.5);
    expect(progress.consumptionPercent).toBe(45);
  });

  it('entrega solo presentada no cierra un bloque; solo aprobada o cierre registrado', () => {
    const original = fixture();
    const project = {
      ...original, modules: original.modules.map((module, index) =>
        index === 0 ? {
          ...module, deliveries: module.deliveries.map((delivery) =>
            ({ ...delivery, status: 'delivered' as const })),
        } : module),
    };
    const progress = calculateProjectExecutionProgress(project, today);
    expect(progress.actualHours).toBe(384);
    expect(progress.actualPercent).toBe(63);
    expect(progress.phases[0]?.blocks[1]?.isClosed).toBe(false);
  });

  it('cuenta solo tareas aprobadas, excluye canceladas, otros equipos y tareas sin bloque', () => {
    const original = fixture();
    const changed = { ...original, modules: original.modules.map((module, index) =>
      index === 1 ? { ...module, tasks: [
        task('done-rpa', teamRpa, 'rpa-2', 'done', 40),
        task('cancelled-rpa', teamRpa, 'rpa-2', 'done', 50, '2026-10-10T00:00:00Z'),
        task('wrong-team', teamQa, 'rpa-2', 'done', 25),
        task('orphan', teamRpa, 'missing-block', 'done', 60),
        task('unapproved', teamPmo, 'pmo-2', 'in_review', 12),
      ] } : module),
    };
    const progress = calculateProjectExecutionProgress(changed, today);
    expect(progress.actualHours).toBe(504);
    expect(progress.actualPercent).toBe(83);
    expect(progress.unlinkedTaskCount).toBe(2);
    expect(progress.phases[1]?.blocks[2]?.actualHours).toBe(40);
    expect(progress.phases[1]?.blocks[0]?.actualHours).toBe(0);
  });

  it('no publica 0% ficticio si hay HH comerciales pero faltan HH de bloques', () => {
    const original = fixture();
    const empty = { ...original, modules: original.modules.map((module) => ({
      ...module, segments: module.segments.map((block) => ({
        ...block, estimatedHours: null,
      })),
    })) };
    const progress = calculateProjectExecutionProgress(empty, today);
    expect(progress.plannedHours).toBe(0);
    expect(progress.hasPlan).toBe(false);
    expect(progress.actualPercent).toBeNull();
    expect(progress.expectedPercent).toBeNull();
    expect(progress.unplannedBlockCount).toBe(6);
    expect(progress.soldHours).toBe(606.5);
  });

  it('no califica como atraso a un proyecto pausado que detiene el reloj', () => {
    const progress = calculateProjectExecutionProgress({
      ...fixture(), status: 'on_hold', stopsClock: true,
    }, today);
    expect(progress.paused).toBe(true);
    expect(progress.expectedPercent).toBe(100);
    expect(progress.actualPercent).toBe(76);
  });

  it('no interpreta tareas comerciales sin bloques como trabajo ya completado', () => {
    const original = fixture();
    const unplanned = {
      ...original,
      modules: [...original.modules, {
        ...original.modules[0]!, id: 'phase-3',
        segments: [], deliveries: [], tasks: [task('orphan-done', teamQa, null, 'done', 500)],
        estimatedHours: 500,
      }],
    };
    const progress = calculateProjectExecutionProgress(unplanned, today);
    expect(progress.plannedHours).toBe(607);
    expect(progress.actualHours).toBe(464);
    expect(progress.unlinkedTaskCount).toBe(1);
    expect(progress.phases[2]?.actualPercent).toBeNull();
  });
});
