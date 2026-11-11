import { describe, expect, it } from 'vitest';
import { buildHistoricalMonths } from './ProjectHoursHistory';

describe('ProjectHoursHistory — eje mensual fiel a las fechas de trabajo', () => {
  it('conserva el mes sin registros entre dos meses con HH, sin mover horas', () => {
    expect(buildHistoricalMonths([
      { month: '2026-05', preactivationHours: 0, executionHours: 1244.2 },
      { month: '2026-07', preactivationHours: 0, executionHours: 894 },
    ])).toEqual([
      { month: '2026-05', preactivationHours: 0, executionHours: 1244.2 },
      { month: '2026-06', preactivationHours: 0, executionHours: 0 },
      { month: '2026-07', preactivationHours: 0, executionHours: 894 },
    ]);
  });

  it('no altera el reparto preactivación/ejecución dentro del mismo mes', () => {
    expect(buildHistoricalMonths([
      { month: '2026-05', preactivationHours: 30, executionHours: 60 },
    ])).toEqual([
      { month: '2026-05', preactivationHours: 30, executionHours: 60 },
    ]);
  });

  it('sin registros devuelve un histórico vacío', () => {
    expect(buildHistoricalMonths([])).toEqual([]);
  });
});
