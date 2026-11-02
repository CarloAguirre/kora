import { describe, expect, it } from 'vitest';
import { isQuotationDraftEligibleProject, approveClientQuotationSchema, type QuotationEligibilityProject } from './quotation.contract';

const base: QuotationEligibilityProject = { type: 'development', salesStage: 'quoted', status: 'draft' };

describe('isQuotationDraftEligibleProject', () => {
  it.each([
    ['prospect', 'draft', true],
    ['prospect', 'active', true],
    ['quoted', 'draft', true],
    ['quoted', 'active', true],
    ['approved', 'draft', true],
    ['approved', 'active', true],
    ['approved', 'on_hold', false],
    ['approved', 'finished', false],
    ['quoted', 'on_hold', false],
    ['quoted', 'finished', false],
    ['prospect', 'cancelled', false],
  ] as const)('%s/%s -> %s', (salesStage, status, expected) => {
    expect(isQuotationDraftEligibleProject({ ...base, salesStage, status })).toBe(expected);
  });

  it('no permite cotizar soporte aunque tenga etapa quoted/active', () => {
    expect(isQuotationDraftEligibleProject({ ...base, type: 'support', status: 'active' })).toBe(false);
  });
});


describe('Aprobación comercial directa sin envío', () => {
  it('admite aprobación normal de versión enviada', () => {
    expect(approveClientQuotationSchema.parse({
      revision: 2, confirmation: 'CLIENTE_APROBO_ESTA_VERSION',
    })).toEqual({ revision: 2, confirmation: 'CLIENTE_APROBO_ESTA_VERSION' });
  });

  it('requiere una declaración literal verificable para aprobación directa', () => {
    const input = { revision: 2, confirmation: 'CLIENTE_APROBO_ESTA_VERSION' };
    expect(approveClientQuotationSchema.parse({
      ...input, confirmWithoutSend: true,
    })).toMatchObject({ confirmWithoutSend: true });
    expect(approveClientQuotationSchema.safeParse({
      ...input, confirmWithoutSend: false,
    }).success).toBe(false);
    expect(approveClientQuotationSchema.safeParse({
      ...input, confirmWithoutSend: 'true',
    }).success).toBe(false);
  });
});
