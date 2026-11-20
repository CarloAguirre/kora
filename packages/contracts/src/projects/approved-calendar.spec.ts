import { describe, expect, it } from 'vitest';
import { approvedCalendarPeriod } from './approved-calendar';

describe('Calendario definitivo de cotización aprobada', () => {
  it('semana 1 empieza el día del Hito 0 y finaliza al término de su duración', () => {
    expect(approvedCalendarPeriod('2026-11-05', 1, 2)).toEqual({
      startDate: '2026-11-05', endDate: '2026-11-18',
    });
  });

  it('desplaza semanas y cruza de año sin corrimientos del huso horario', () => {
    expect(approvedCalendarPeriod('2026-11-05', 3, 5)).toEqual({
      startDate: '2026-11-19', endDate: '2026-12-23',
    });
    expect(approvedCalendarPeriod('2026-12-28', 2, 1)).toEqual({
      startDate: '2027-01-04', endDate: '2027-01-10',
    });
  });

  it('rechaza calendarios inválidos en vez de inventar períodos', () => {
    expect(approvedCalendarPeriod('', 1, 1)).toBeNull();
    expect(approvedCalendarPeriod('2026-02-30', 1, 1)).toBeNull();
    expect(approvedCalendarPeriod('2026-11-05', 0, 1)).toBeNull();
    expect(approvedCalendarPeriod('2026-11-05', 1, 0)).toBeNull();
  });
});
