import { describe, expect, it } from 'vitest';
import { splitByDailyCap } from './daily-cap';

describe('splitByDailyCap', () => {
  it('deja todo como horas normales mientras quepa en la jornada de 8h', () => {
    expect(splitByDailyCap(4, 3)).toEqual([{ hours: 4, isOvertime: false }]);
  });

  it('separa el excedente de 8h como horas extra', () => {
    expect(splitByDailyCap(4, 5)).toEqual([
      { hours: 3, isOvertime: false },
      { hours: 1, isOvertime: true },
    ]);
  });

  it('marca todo como horas extra si la jornada ya está completa', () => {
    expect(splitByDailyCap(2.5, 8)).toEqual([{ hours: 2.5, isOvertime: true }]);
  });
});
