import { describe, expect, it } from 'vitest';
import { proposedBlockPeriod, displayProposedDate } from './quotation-relative-dates';

describe('Proyección no persistida de semanas de cotización', () => {
  it('convierte semana 1 tomando el inicio del proyecto sin adelantarla', () => {
    expect(proposedBlockPeriod('2026-11-05', 1, 2)).toEqual({
      startDate: '2026-11-05', endDate: '2026-11-18',
    });
  });
  it('respeta la semana relativa y la duración, sin solapar la siguiente semana', () => {
    expect(proposedBlockPeriod('2026-11-05', 3, 5)).toEqual({
      startDate: '2026-11-19', endDate: '2026-12-23',
    });
  });
  it('calcula días por UTC sin corrimiento de zonas horarias ni DST', () => {
    expect(proposedBlockPeriod('2026-03-01', 1, 2)).toEqual({
      startDate: '2026-03-01', endDate: '2026-03-14',
    });
    expect(displayProposedDate('2026-11-05')).toBe('05-11-2026');
  });
  it('no inventa fechas sin inicio ni calendario comercial válido', () => {
    expect(proposedBlockPeriod(null, 1, 2)).toBeNull();
    expect(proposedBlockPeriod('2026-11-05', 0, 2)).toBeNull();
    expect(proposedBlockPeriod('2026-11-05', 1, 0)).toBeNull();
  });
});
