import { describe, expect, it } from 'vitest';
import { daysLate, deadlineNote } from './deadline-note';

describe('deadlineNote', () => {
  const committed = new Date('2026-09-24');

  it('terminar el mismo día de la fecha comprometida (hora de Chile) cuenta como a tiempo', () => {
    // 23:30 del 24-09 en Chile ya es 25-09 en UTC.
    expect(daysLate(committed, new Date('2026-09-25T02:30:00Z'))).toBe(0);
    expect(deadlineNote(committed, new Date('2026-09-25T02:30:00Z'))).toBe('a tiempo (fecha comprometida 24-09-2026)');
  });

  it('antes de la fecha comprometida es a tiempo', () => {
    expect(deadlineNote(committed, new Date('2026-09-20T15:00:00Z'))).toMatch(/^a tiempo/);
  });

  it('después, informa los días de atraso', () => {
    expect(deadlineNote(committed, new Date('2026-09-25T15:00:00Z'))).toBe('con 1 día de atraso (fecha comprometida 24-09-2026)');
    expect(deadlineNote(committed, new Date('2026-09-29T15:00:00Z'))).toBe('con 5 días de atraso (fecha comprometida 24-09-2026)');
  });
});
