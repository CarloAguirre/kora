import { describe, expect, it } from 'vitest';
import { calculateScheduleElapsedPercent } from './project-progress-display';

describe('calculateScheduleElapsedPercent — fallback cronológico sin plan', () => {
  it('día 5 de un plazo de 10 días = 50%, sin depender de Hito 0 ni HH', () => {
    expect(calculateScheduleElapsedPercent('2026-01-01', '2026-01-10', '2026-01-05')).toBe(50);
  });

  it('cuenta fechas inclusivas: inicio 10% y último día 100%', () => {
    expect(calculateScheduleElapsedPercent('2026-01-01', '2026-01-10', '2026-01-01')).toBe(10);
    expect(calculateScheduleElapsedPercent('2026-01-01', '2026-01-10', '2026-01-10')).toBe(100);
  });

  it('limita a 0% antes y 100% después sin atribuir avance real', () => {
    expect(calculateScheduleElapsedPercent('2026-01-01', '2026-01-10', '2025-12-01')).toBe(0);
    expect(calculateScheduleElapsedPercent('2026-01-01', '2026-01-10', '2026-02-01')).toBe(100);
  });

  it('un proyecto con solo un día llega al 100% en ese día', () => {
    expect(calculateScheduleElapsedPercent('2026-01-05', '2026-01-05', '2026-01-05')).toBe(100);
  });

  it('no inventa porcentaje cuando faltan fechas o son inválidas', () => {
    expect(calculateScheduleElapsedPercent(null, '2026-01-10', '2026-01-05')).toBeNull();
    expect(calculateScheduleElapsedPercent('2026-01-01', null, '2026-01-05')).toBeNull();
    expect(calculateScheduleElapsedPercent('2026-01-10', '2026-01-01', '2026-01-05')).toBeNull();
    expect(calculateScheduleElapsedPercent('2026-02-30', '2026-03-01', '2026-03-01')).toBeNull();
  });

  it('App Walvy: 30/03 a 21/12 y hoy 12/11 muestran ~85% del plazo', () => {
    expect(calculateScheduleElapsedPercent('2026-03-30', '2026-12-21', '2026-11-12')).toBe(85);
  });
});
