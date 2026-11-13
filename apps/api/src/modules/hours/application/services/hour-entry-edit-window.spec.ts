import { describe, expect, it } from 'vitest';
import { isInCurrentMonth } from './hour-entry-edit-window';

describe('isInCurrentMonth', () => {
  const now = new Date('2026-10-20T15:00:00Z');

  it('acepta una fecha del mes en curso', () => {
    expect(isInCurrentMonth(new Date('2026-10-01'), now)).toBe(true);
    expect(isInCurrentMonth(new Date('2026-10-31'), now)).toBe(true);
  });

  it('rechaza fechas de otros meses', () => {
    expect(isInCurrentMonth(new Date('2026-09-30'), now)).toBe(false);
    expect(isInCurrentMonth(new Date('2026-11-01'), now)).toBe(false);
  });

  it('usa el mes de Chile, no el de UTC', () => {
    // 1 de noviembre 01:00 UTC = 31 de octubre en Santiago.
    const lateOctober = new Date('2026-11-01T01:00:00Z');
    expect(isInCurrentMonth(new Date('2026-10-15'), lateOctober)).toBe(true);
    expect(isInCurrentMonth(new Date('2026-11-01'), lateOctober)).toBe(false);
  });
});
