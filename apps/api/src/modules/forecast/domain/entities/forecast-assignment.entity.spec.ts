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
});
