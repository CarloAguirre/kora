import { describe, expect, it } from 'vitest';
import { ForecastAssignment } from './forecast-assignment.entity';

const NOW = new Date('2026-08-26T12:00:00.000Z');
// 2026-08-24 es lunes; 2026-08-28 es viernes.
const MONDAY = new Date('2026-08-24T00:00:00.000Z');
const FRIDAY = new Date('2026-08-28T00:00:00.000Z');

const validProps = {
  id: 'fa1',
  teamMemberId: 'member-1',
  periodStart: MONDAY,
  periodEnd: FRIDAY,
  type: 'project' as const,
  assignedHours: 20,
  now: NOW,
};

describe('ForecastAssignment', () => {
  describe('creación', () => {
    it('crea una asignación válida', () => {
      const result = ForecastAssignment.create(validProps);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.assignedHours).toBe(20);
        expect(result.value.type).toBe('project');
      }
    });

    it('rechaza un período que no inicia en lunes', () => {
      const tuesday = new Date('2026-08-25T00:00:00.000Z');
      const result = ForecastAssignment.create({ ...validProps, periodStart: tuesday });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('FORECAST_INVALID_PERIOD');
    });

    it('rechaza un período que no es de lunes a viernes completo', () => {
      const wednesday = new Date('2026-08-26T00:00:00.000Z');
      const result = ForecastAssignment.create({ ...validProps, periodEnd: wednesday });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('FORECAST_INVALID_PERIOD');
    });

    it('rechaza HH asignadas negativas', () => {
      const result = ForecastAssignment.create({ ...validProps, assignedHours: -1 });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('FORECAST_INVALID_HOURS');
    });

    it('recorta los comentarios', () => {
      const result = ForecastAssignment.create({ ...validProps, comments: '  listo  ' });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) expect(result.value.toSnapshot().comments).toBe('listo');
    });
  });

  describe('edición', () => {
    const created = () => {
      const result = ForecastAssignment.create(validProps);
      if (result.isErr()) throw new Error('setup failed');
      return result.value;
    };

    it('actualiza las HH asignadas', () => {
      const assignment = created();
      const result = assignment.updateDetails({ assignedHours: 12 }, NOW);

      expect(result.isOk()).toBe(true);
      expect(assignment.assignedHours).toBe(12);
    });

    it('rechaza actualizar a HH negativas', () => {
      const assignment = created();
      const result = assignment.updateDetails({ assignedHours: -5 }, NOW);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('FORECAST_INVALID_HOURS');
    });
  });

  describe('filas calculadas', () => {
    const calculated = (overrides: Partial<Parameters<typeof ForecastAssignment.restore>[0]> = {}) =>
      ForecastAssignment.restore({
        id: 'fa2',
        legacyId: null,
        teamMemberId: 'member-1',
        periodStart: MONDAY,
        periodEnd: FRIDAY,
        type: 'project',
        projectId: 'project-1',
        clientId: null,
        comments: '',
        assignedHours: 22,
        source: 'segment',
        calculatedHours: 22,
        adjustedAt: null,
        adjustedByUserId: null,
        isStale: false,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
      });

    it('cambiar sus HH la deja ajustada por quien la editó', () => {
      const assignment = calculated();
      const result = assignment.updateDetails({ assignedHours: 30 }, NOW, 'leader-1');

      expect(result.isOk()).toBe(true);
      expect(assignment.assignedHours).toBe(30);
      expect(assignment.isAdjusted).toBe(true);
      expect(assignment.toSnapshot().adjustedByUserId).toBe('leader-1');
    });

    it('volver a poner lo calculado quita el ajuste y el desfase', () => {
      const assignment = calculated({ assignedHours: 30, adjustedAt: NOW, adjustedByUserId: 'leader-1', isStale: true });
      assignment.updateDetails({ assignedHours: 22 }, NOW, 'leader-1');

      expect(assignment.isAdjusted).toBe(false);
      expect(assignment.isStale).toBe(false);
    });

    it('editar solo el comentario no la ajusta', () => {
      const assignment = calculated();
      assignment.updateDetails({ comments: 'Cierre de sprint', assignedHours: 22 }, NOW, 'leader-1');

      expect(assignment.isAdjusted).toBe(false);
      expect(assignment.comments).toBe('Cierre de sprint');
    });

    it('no permite cambiar tipo ni proyecto', () => {
      const assignment = calculated();
      const result = assignment.updateDetails({ type: 'support' }, NOW, 'leader-1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.code).toBe('FORECAST_CALCULATED_ROW_LOCKED');
    });

    it('"Volver al cálculo" usa las HH calculadas', () => {
      const assignment = calculated({ assignedHours: 30, calculatedHours: 18, adjustedAt: NOW, adjustedByUserId: 'leader-1', isStale: true });
      const result = assignment.resetToCalculation(NOW);

      expect(result.isOk()).toBe(true);
      expect(assignment.assignedHours).toBe(18);
      expect(assignment.isAdjusted).toBe(false);
      expect(assignment.isStale).toBe(false);
    });

    it('"Mantener mi ajuste" conserva las HH y quita el desfase', () => {
      const assignment = calculated({ assignedHours: 30, calculatedHours: 18, adjustedAt: NOW, adjustedByUserId: 'leader-1', isStale: true });
      assignment.keepAdjustment(NOW);

      expect(assignment.assignedHours).toBe(30);
      expect(assignment.isAdjusted).toBe(true);
      expect(assignment.isStale).toBe(false);
    });

    it('una fila manual no tiene cálculo al que volver', () => {
      const result = ForecastAssignment.create(validProps);
      if (result.isErr()) throw new Error('setup failed');

      const reset = result.value.resetToCalculation(NOW);
      expect(reset.isErr()).toBe(true);
      if (reset.isErr()) expect(reset.error.code).toBe('FORECAST_ROW_NOT_CALCULATED');
    });
  });
});
