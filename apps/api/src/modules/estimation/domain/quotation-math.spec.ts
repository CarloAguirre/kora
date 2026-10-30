import { describe, expect, it } from 'vitest';
import { quotationDraftDataSchema } from '@kora/contracts';
import { calculateQuotation } from './quotation-math';
const teamId = '0777e456-fd76-445e-83f1-afc25061c101';

describe('calculateQuotation', () => {
  it('convierte días en semanas de 5 días y aplica cupos/dedicación', () => {
    const draft = quotationDraftDataSchema.parse({
      teams: [{ teamId, collaborators: 2, unit: 'day', duration: 10, hoursPerWeek: 40, dedicationPercent: 50 }],
      costs: [{ description: 'Licencia', amount: 2, recurrence: 'once' }, { description: 'SaaS', amount: 4, recurrence: 'monthly' }],
    });
    expect(calculateQuotation(draft, 0.5, 'iva19')).toEqual({ totalHours: 80, netAmount: 42, totalAmount: 49.98 });
  });

  it('calcula por fases sin duplicar HH y deja la tarifa vacía hasta definirla', () => {
    const draft = quotationDraftDataSchema.parse({
      mode: 'phases', teams: [{ teamId, collaborators: 1, unit: 'week', duration: 5, hoursPerWeek: 40, dedicationPercent: 100 }],
      phases: [{ name: 'Módulo', startWeek: 1, durationWeeks: 2, teamHours: [{ teamId, hours: 24 }] }],
    });
    expect(calculateQuotation(draft, null, 'exempt')).toEqual({ totalHours: 24, netAmount: null, totalAmount: null });
  });

  it('rechaza HH de fase asociadas a un equipo inexistente', () => {
    expect(() => quotationDraftDataSchema.parse({
      mode: 'phases',
      phases: [{ name: 'Sin equipo', startWeek: 1, durationWeeks: 1, teamHours: [{ teamId, hours: 12 }] }],
    })).toThrow();
  });
});
