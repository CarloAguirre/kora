import { describe, expect, it } from 'vitest';
import { hasOnlyCommercialPreparationHours } from './commercial-preparation-transfer';
const record = { assignment: 'Prospecto', moduleId: null, status:'approved' as const, hours:'2.50' };
describe('Traslado seguro de preparación comercial', () => {
  it('identifica entradas Prospecto sin módulo que coinciden con HH consumidas', () => {
    expect(hasOnlyCommercialPreparationHours([record,{...record,hours:'22'}],24.5)).toBe(true);
  });
  it('rechaza ejecución, horas sin clasificación o suma inconsistente', () => {
    expect(hasOnlyCommercialPreparationHours([],0)).toBe(false);
    expect(hasOnlyCommercialPreparationHours([{...record, assignment:'Desarrollo'}],2.5)).toBe(false);
    expect(hasOnlyCommercialPreparationHours([{...record, moduleId:'any'}],2.5)).toBe(false);
    expect(hasOnlyCommercialPreparationHours([record],24.5)).toBe(false);
    expect(hasOnlyCommercialPreparationHours([{...record,status:'pending'}],2.5)).toBe(false);
  });
});
