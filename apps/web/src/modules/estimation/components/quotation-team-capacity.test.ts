import { describe, expect, it } from 'vitest';
import { quotationTeamCapacity, KORA_QUOTATION_REFERENCE_WEEK_HOURS } from './quotation-team-capacity';
import type { QuotationDraftData } from '@kora/contracts';
import type { QuotationTeamWeeklyRow } from './quotation-team-weekly-plan';

const row = (weekly: Array<[number, number]>): QuotationTeamWeeklyRow => ({
  teamKey: 'dev', totalHours: weekly.reduce((s, [, hh]) => s + hh, 0),
  firstWeek: Math.min(...weekly.map(([week]) => week)),
  lastWeek: Math.max(...weekly.map(([week]) => week)),
  activeWeeks: weekly.length,
  averageHoursPerWeek: weekly.reduce((s, [, hh]) => s + hh, 0) / weekly.length,
  weeklyHours: new Map(weekly),
});
const team = (patch: Partial<QuotationDraftData['teams'][number]> = {}) => ({
  teamId: 'dev', collaborators: 3, unit: 'week' as const, duration: 1,
  hoursPerWeek: 33.33, dedicationPercent: 100, ...patch,
});

describe('Capacidad orientativa de una cotización EDT', () => {
  it('100 HH / 3 personas / 1 semana = 33,33 HH y 83,33% de ocupación, no 100%', () => {
    expect(KORA_QUOTATION_REFERENCE_WEEK_HOURS).toBe(40);
    const original = quotationTeamCapacity(team(), 100, row([[1, 100]]), true);
    expect(original.averagePerPerson).toBe(33.33);
    expect(original.occupationPercent).toBe(83.33);
    expect(original.capacityPerPerson).toBe(40);
    expect(original.overloadedWeeks).toEqual([]);
    expect(original.peakPerPerson).toBe(33.33);
  });

  it('al agregar un colaborador cambia carga y ocupación sin cambiar las HH', () => {
    const two = quotationTeamCapacity(team({ collaborators: 2 }), 100, row([[1, 100]]), true);
    const four = quotationTeamCapacity(team({ collaborators: 4 }), 100, row([[1, 100]]), true);
    expect(two.averagePerPerson).toBe(50);
    expect(two.occupationPercent).toBe(125);
    expect(two.overloadedWeeks).toEqual([1]);
    expect(four.averagePerPerson).toBe(25);
    expect(four.occupationPercent).toBe(62.5);
    expect(four.overloadedWeeks).toEqual([]);
  });

  it('la dedicación planificada reduce capacidad, pero nunca las HH EDT', () => {
    const constrained = quotationTeamCapacity(
      team({ hoursPerWeek: 20, dedicationPercent: 50 }), 100, row([[1, 100]]), true);
    expect(constrained.averagePerPerson).toBe(33.33);
    expect(constrained.occupationPercent).toBe(83.33);
    expect(constrained.capacityPerPerson).toBe(20);
    expect(constrained.overloadedWeeks).toEqual([1]);
  });

  it('detecta picos de fases solapadas aunque la media parezca baja', () => {
    const plan = row([[1, 20], [2, 45], [3, 5]]);
    const audit = quotationTeamCapacity(
      team({ collaborators: 1, duration: 3 }), 70, plan, true);
    expect(audit.averagePerPerson).toBe(23.33);
    expect(audit.overAverageCapacity).toBe(false);
    expect(audit.peakWeek).toBe(2);
    expect(audit.peakPerPerson).toBe(45);
    expect(audit.overloadedWeeks).toEqual([2]);
  });

  it('advierte duración menor al calendario y no inventa picos de una EDT v1', () => {
    const laterStart = row([[3, 25]]);
    expect(quotationTeamCapacity(
      team({ collaborators: 1, duration: 2 }), 25, laterStart, true)
      .durationConflict).toBe(false); // semana de inicio ≠ duración en semanas
    const twoActiveWeeks = row([[3, 25], [4, 25]]);
    const mismatched = quotationTeamCapacity(
      team({ collaborators: 1, duration: 1 }), 50, twoActiveWeeks, true);
    expect(mismatched.durationConflict).toBe(true);
    const legacy = quotationTeamCapacity(team(), 100, undefined, true);
    expect(legacy.scheduleUnavailable).toBe(true);
    expect(legacy.peakWeek).toBeNull();
    expect(legacy.overloadedWeeks).toEqual([]);
    expect(quotationTeamCapacity(team({ duration: 0 }), 100, undefined, true)
      .missingDuration).toBe(true);
  });

  it('manual no multiplica dos veces: 20 hh/sem equivale a 50%', () => {
    const manual = quotationTeamCapacity(team({ hoursPerWeek: 20, dedicationPercent: 50 }), 60);
    expect(manual.averagePerPerson).toBe(20);
    expect(manual.occupationPercent).toBe(50);
    expect(manual.capacityPerPerson).toBe(20);
    expect(manual.overloadedWeeks).toEqual([]);
  });
});
