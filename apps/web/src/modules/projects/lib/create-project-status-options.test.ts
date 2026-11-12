import { describe, expect, it } from 'vitest';
import { createProjectSchema } from '@kora/contracts';
import { STATUS_OPTIONS_APPROVED, STATUS_OPTIONS_NOT_APPROVED } from './create-project-status-options';

describe('Estado al crear Prospectos / Cotizaciones (regresión 2026-10-28)', () => {
  it('ofrece Detenido antes de aprobación, pero nunca Activo', () => {
    expect(STATUS_OPTIONS_NOT_APPROVED.map(({ value }) => value)).toEqual(['on_hold']);
    expect(STATUS_OPTIONS_NOT_APPROVED.map(({ label }) => label)).toContain('Detenido');
    expect(STATUS_OPTIONS_APPROVED.map(({ value }) => value)).toEqual(['active', 'on_hold']);
  });

  it.each(['prospect', 'quoted'] as const)(
    'el contrato admite crear un %s detenido sin cambiar etapa comercial',
    (salesStage) => {
      const result = createProjectSchema.safeParse({
        name: 'Oportunidad pausada', type: 'development', salesStage, status: 'on_hold',
        leaderUserId: '11111111-1111-4111-8111-111111111111',
        commercialManagerUserId: '22222222-2222-4222-8222-222222222222',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.salesStage).toBe(salesStage);
        expect(result.data.status).toBe('on_hold');
      }
      expect(createProjectSchema.safeParse({
        name: 'No aprobar antes de tiempo', type: 'development', salesStage, status: 'active',
        leaderUserId: '11111111-1111-4111-8111-111111111111',
        commercialManagerUserId: '22222222-2222-4222-8222-222222222222',
      }).success).toBe(false);
    },
  );
});
