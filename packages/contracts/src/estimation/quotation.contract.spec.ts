import { describe, expect, it } from 'vitest';
import { isQuotationDraftEligibleProject, type QuotationEligibilityProject } from './quotation.contract';

const base: QuotationEligibilityProject = { type: 'development', salesStage: 'quoted', status: 'draft' };

describe('isQuotationDraftEligibleProject', () => {
  it.each([
    ['prospect', 'draft', true],
    ['prospect', 'active', true],
    ['quoted', 'draft', true],
    ['quoted', 'active', true],
    ['approved', 'draft', false],
    ['approved', 'active', false],
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
