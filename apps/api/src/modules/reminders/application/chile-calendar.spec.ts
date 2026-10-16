import { describe, expect, it } from 'vitest';
import { addDays, chileDate, daysBetween, weekdaysBetween } from './chile-calendar';

describe('chile-calendar', () => {
  it('chileDate usa el día local de Santiago, también con horario de verano', () => {
    // 23:30 del 15-oct en Santiago (UTC-3 en verano) ya es 16-oct en UTC.
    expect(chileDate(new Date('2026-10-16T02:30:00Z'))).toBe('2026-10-15');
    // 18:00 de Santiago en invierno (UTC-4).
    expect(chileDate(new Date('2026-07-15T22:00:00Z'))).toBe('2026-07-15');
  });

  it('weekdaysBetween excluye sábados y domingos', () => {
    expect(weekdaysBetween('2026-10-09', '2026-10-13')).toEqual(['2026-10-09', '2026-10-12', '2026-10-13']);
  });

  it('addDays y daysBetween cruzan meses', () => {
    expect(addDays('2026-10-16', -29)).toBe('2026-09-17');
    expect(daysBetween('2026-09-30', '2026-10-02')).toBe(2);
  });
});
