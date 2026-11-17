import { describe, expect, it } from 'vitest';
import { dateInSantiago, quotationCalendarAnchor } from './quotation-calendar-anchor';

describe('Ancla de calendario tras cotización en proyecto activo', () => {
  const projectStartDate = new Date('2026-11-01T00:00:00Z');
  const transferredAt = new Date('2026-11-16T14:10:00Z');

  it('sin Fase 0 utiliza la fecha de inicio existente y no cambia nada más', () => {
    expect(quotationCalendarAnchor({ projectStartDate, hito0At: null, transferredAt,
      transferMetadata: { priorCommercialState: { usedHours: 0 } } }))
      .toEqual({ startIso: '2026-11-01', usedTransferDate: false });
  });
  it('con Fase 0 inicia la EDT el día local del traspaso, no al inicio histórico', () => {
    expect(quotationCalendarAnchor({ projectStartDate, hito0At: null, transferredAt,
      transferMetadata: { priorCommercialState: { usedHours: 548.5 } } }))
      .toEqual({ startIso: '2026-11-16', usedTransferDate: true });
  });
  it('el día local chileno evita adelantar fases por el huso UTC', () => {
    expect(dateInSantiago(new Date('2026-11-16T01:00:00Z'))).toBe('2026-11-15');
  });
  it('proyectos sin fecha existente no inventan inicio salvo que tengan Fase 0', () => {
    expect(quotationCalendarAnchor({ projectStartDate: null, hito0At: null, transferredAt,
      transferMetadata: {} }).startIso).toBeNull();
    expect(quotationCalendarAnchor({ projectStartDate: null, hito0At: null, transferredAt,
      transferMetadata: { priorCommercialState: { usedHours: 1 } } }).startIso)
      .toBe('2026-11-16');
  });
});