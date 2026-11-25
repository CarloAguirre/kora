import { describe, expect, it } from 'vitest';
import { soldHoursAreCommercialEstimate } from './quotation-transfer-sold-hours';

describe('soldHoursAreCommercialEstimate', () => {
  it('trata como estimado un proyecto sin Roadmap aunque tenga monto y tramos sin facturar', () => {
    expect(soldHoursAreCommercialEstimate({
      moduleCount: 0, paymentStatuses: ['to_invoice', 'pending'],
    })).toBe(true);
  });

  it('no reemplaza con Roadmap o con hitos facturados/pagados', () => {
    expect(soldHoursAreCommercialEstimate({ moduleCount: 1, paymentStatuses: [] })).toBe(false);
    expect(soldHoursAreCommercialEstimate({ moduleCount: 0, paymentStatuses: ['invoiced'] })).toBe(false);
    expect(soldHoursAreCommercialEstimate({ moduleCount: 0, paymentStatuses: ['paid'] })).toBe(false);
  });
});
