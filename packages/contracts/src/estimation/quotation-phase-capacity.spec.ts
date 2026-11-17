import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from './quotation.contract';
import { assertQuotationPhaseCapacity, quotationPhaseCapacityOverloads,
  isValidQuotationWeekSpan } from './quotation-phase-capacity';

const DEV = '0777e456-fd76-445e-83f1-afc25061c103';
const team = { teamId: DEV, collaborators: 1, unit: 'week' as const,
  duration: 5, hoursPerWeek: 40, dedicationPercent: 100 };
const make = (phases: Array<{ name: string; startWeek: number; durationWeeks: number; hours: number }>) =>
  quotationDraftDataSchema.parse({ mode: 'phases', teams: [team],
    phases: phases.map(({ hours, ...p }) => ({ ...p, teamHours: [{ teamId: DEV, hours }] })) });

describe('Calendario comercial: medias semanas y capacidad real', () => {
  it('admite 1,5 semanas pero rechaza valores de décimas distintos de 0,5', () => {
    expect(isValidQuotationWeekSpan(1, 1.5)).toBe(true);
    expect(isValidQuotationWeekSpan(1.5, 0.5)).toBe(true);
    expect(isValidQuotationWeekSpan(1, 0.7)).toBe(false);
    expect(isValidQuotationWeekSpan(520.5, 0.5)).toBe(true);
    expect(isValidQuotationWeekSpan(520.5, 1)).toBe(false);
  });
  it('no permite comprimir un esfuerzo de 100 HH/5 semanas a 1 o 1,5 con una persona', () => {
    const valid = make([{ name: 'Desarrollo', startWeek: 1, durationWeeks: 5, hours: 100 }]);
    expect(() => assertQuotationPhaseCapacity(valid)).not.toThrow();
    for (const durationWeeks of [1, 1.5]) {
      const invalid = make([{ name: 'Desarrollo', startWeek: 1, durationWeeks, hours: 100 }]);
      expect(() => assertQuotationPhaseCapacity(invalid, () => 'Desarrollo'))
        .toThrow(/Plazo inviable para Desarrollo/);
    }
  });
  it('detecta solapamientos de dos fases dentro de la misma media semana', () => {
    const overlap = make([
      { name: 'Diseño', startWeek: 1, durationWeeks: 0.5, hours: 14 },
      { name: 'Desarrollo', startWeek: 1, durationWeeks: 0.5, hours: 14 },
    ]);
    expect(quotationPhaseCapacityOverloads(overlap)).toMatchObject([
      { teamId: DEV, week: 1, hours: 28, availableHours: 20 },
    ]);
    expect(() => assertQuotationPhaseCapacity(overlap)).toThrow(/Plazo inviable/);
  });
  it('mantiene las HH y permite fases secuenciales en medias semanas', () => {
    const valid = make([
      { name: 'A', startWeek: 1, durationWeeks: 0.5, hours: 15 },
      { name: 'B', startWeek: 1.5, durationWeeks: 0.5, hours: 15 },
      { name: 'C', startWeek: 2, durationWeeks: 0.5, hours: 15 },
    ]);
    expect(quotationPhaseCapacityOverloads(valid)).toEqual([]);
    expect(valid.phases.reduce((sum, p) => sum + p.teamHours[0]!.hours, 0)).toBe(45);
  });
  it('la misma carga puede ser viable al aumentar la dotación', () => {
    const data = make([{ name: 'Implementación', startWeek: 1, durationWeeks: 1, hours: 70 }]);
    expect(() => assertQuotationPhaseCapacity(data)).toThrow();
    expect(() => assertQuotationPhaseCapacity({ ...data,
      teams: [{ ...team, collaborators: 2 }] })).not.toThrow();
  });
});