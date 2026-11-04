import { describe, expect, it } from 'vitest';
import type { ProjectDetail } from '@kora/contracts';
import { calculateTeamProgress } from './team-progress';

const teamId = 'team-1';
const otherTeamId = 'team-2';
const today = '2026-11-05';

function fixture(options?: {
  readonly status?: 'active' | 'on_hold';
  readonly closed?: boolean;
  readonly deliveryStatus?: 'planned' | 'delivered' | 'approved';
  readonly cancelApproved?: boolean;
  readonly secondBlock?: boolean;
}) {
  return {
    status: options?.status ?? 'active',
    stopsClock: options?.status === 'on_hold',
    teams: [{ teamId, assignedHours: 180 }],
    members: [
      { id: 'member-1', teamId, consumedHours: 39, blockedAt: null },
      // Bloquear no hace desaparecer HH de la historia del equipo.
      { id: 'member-2', teamId, consumedHours: 38, blockedAt: '2026-11-03T12:00:00Z' },
      { id: 'member-3', teamId: otherTeamId, consumedHours: 99 },
    ],
    modules: [
      {
        id: 'module-1', name: 'Mejoras y correcciones',
        segments: [
          { id: 'block-1', teamId, name: 'Mejoras y correcciones Desarrollo',
            startDate: '2026-11-01', endDate: '2026-11-10',
            estimatedHours: 100, consumedHours: 61, closedAt: options?.closed ? '2026-11-04T20:00:00Z' : null },
          ...(options?.secondBlock ? [{ id: 'block-1-extra', teamId, name: 'Otro bloque',
            startDate: '2026-11-01', endDate: '2026-11-10', estimatedHours: 20, closedAt: null }] : []),
        ],
        deliveries: [{ id: 'delivery-1', segmentId: 'block-1', teamId,
          status: options?.deliveryStatus ?? 'planned' }],
        tasks: [
          { id: 'task-done', segmentId: 'block-1', teamId, status: 'done',
            estimatedHours: 16, date: '2026-11-04', assigneeUserId: 'person-1',
            cancelledAt: options?.cancelApproved ? '2026-11-05T12:00:00Z' : null },
          { id: 'task-review', segmentId: 'block-1', teamId, status: 'in_review',
            estimatedHours: 24, date: '2026-11-03', assigneeUserId: 'person-1' },
          { id: 'task-todo', segmentId: 'block-1', teamId, status: 'todo',
            estimatedHours: 30, date: '2026-11-04', assigneeUserId: null },
          { id: 'other-team-task', segmentId: 'block-1', teamId: otherTeamId, status: 'done',
            estimatedHours: 100, date: '2026-11-02', assigneeUserId: 'other-person' },
        ],
      },
      {
        id: 'module-2', name: 'Calculadora de estimaciones',
        segments: [{ id: 'block-2', teamId, name: 'Calculadora Desarrollo',
          startDate: '2026-11-01', endDate: '2026-11-10', estimatedHours: 80, consumedHours: 16, closedAt: null }],
        deliveries: [],
        tasks: [{ id: 'task-calc', segmentId: 'block-2', teamId, status: 'in_progress',
          estimatedHours: 80, date: '2026-11-08', assigneeUserId: 'person-2' }],
      },
    ],
  } as unknown as Pick<ProjectDetail, 'modules' | 'teams' | 'members' | 'status' | 'stopsClock'>;
}

describe('Avance del equipo — fechas, aprobaciones y horas reales', () => {
  it('calcula 16 de 180 HH aprobadas = 9% real, 50% esperado por días y 43% consumo', () => {
    const result = calculateTeamProgress(fixture(), teamId, today);
    expect(result.hasPlan).toBe(true);
    expect(result.plannedHours).toBe(180);
    expect(result.actualHours).toBe(16);
    expect(result.actualPercent).toBe(9);
    expect(result.expectedHours).toBe(90);
    expect(result.expectedPercent).toBe(50);
    expect(result.consumedHours).toBe(77);
    expect(result.consumptionPercent).toBe(43);
    expect(result.phases[0]?.consumedHours).toBe(61);
    expect(result.phases[0]?.blocks[0]?.consumedHours).toBe(61);
    expect(result.phases[1]?.consumedHours).toBe(16);
    expect(result.phases[1]?.blocks[0]?.consumedHours).toBe(16);
    expect(result.phases.map((phase) => phase.name))
      .toEqual(['Mejoras y correcciones', 'Calculadora de estimaciones']);
    expect(result.phases[0]?.pendingApprovalCount).toBe(1);
    expect(result.phases[0]?.overdueCount).toBe(2);
    expect(result.phases[0]?.unassignedCount).toBe(1);
    expect(result.phases[0]?.gapPoints).toBe(19);
    expect(result.phases[1]?.gapPoints).toBe(22);
  });

  it('una entrega presentada pero no aprobada NO cierra el bloque', () => {
    const delivered = calculateTeamProgress(fixture({ deliveryStatus: 'delivered' }), teamId, today);
    expect(delivered.phases[0]?.blocks[0]?.isClosed).toBe(false);
    expect(delivered.phases[0]?.blocks[0]?.actualHours).toBe(16);
  });

  it('una entrega aprobada o el cierre persistido sí hacen contar el bloque al 100%', () => {
    const approved = calculateTeamProgress(fixture({ deliveryStatus: 'approved' }), teamId, today);
    const closed = calculateTeamProgress(fixture({ closed: true }), teamId, today);
    expect(approved.phases[0]?.blocks[0]?.actualHours).toBe(100);
    expect(closed.phases[0]?.blocks[0]?.actualHours).toBe(100);
    expect(approved.actualPercent).toBe(56);
  });

  it('tareas canceladas no generan progreso ni aparecen como trabajo vigente', () => {
    const result = calculateTeamProgress(fixture({ cancelApproved: true }), teamId, today);
    expect(result.actualHours).toBe(0);
    expect(result.phases[0]?.pendingApprovalCount).toBe(1);
  });

  it('sin bloques no inventa un 0% esperado ni real', () => {
    const project = fixture();
    const empty = { ...project, modules: [] };
    const result = calculateTeamProgress(empty, teamId, today);
    expect(result.hasPlan).toBe(false);
    expect(result.actualPercent).toBeNull();
    expect(result.expectedPercent).toBeNull();
  });

  it('un proyecto pausado conserva cifras pero no califica su brecha como atraso', () => {
    const result = calculateTeamProgress(fixture({ status: 'on_hold' }), teamId, today);
    expect(result.paused).toBe(true);
    expect(result.expectedPercent).toBe(50);
  });

  it('no reparte una tarea sin bloque entre varios bloques de una misma fase', () => {
    const project = fixture({ secondBlock: true });
    const module = project.modules[0]!;
    const withLegacy = {
      ...project, modules: [{ ...module, tasks: [
        ...module.tasks,
        { id: 'legacy', teamId, segmentId: null, description: null,
          status: 'done', estimatedHours: 25, date: today, assigneeUserId: 'person-1' },
      ] }, ...project.modules.slice(1)],
    } as unknown as typeof project;
    const result = calculateTeamProgress(withLegacy, teamId, today);
    expect(result.unlinkedTaskCount).toBe(1);
    expect(result.actualHours).toBe(16);
    expect(result.phases[0]?.blocks[1]?.actualHours).toBe(0);
  });
});
