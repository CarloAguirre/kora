import { describe, expect, it } from 'vitest';
import { hasOnlyCommercialPreparationHours, planCommercialPreparationTransfer } from './commercial-preparation-transfer';
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


describe('Fase 1 no calendarizada: presupuestos preexistentes al traspasar', () => {
  it('suma horas aprobadas sin sobrescribir las del equipo compartido', () => {
    const plan = planCommercialPreparationTransfer({
      previousSoldHours: 120,
      approvedQuotationHours: 100,
      existingTeams: [
        { teamId: 'desarrollo', assignedHours: '90.50' },
        { teamId: 'ux', assignedHours: '29.50' },
      ],
      quotationTeams: [
        { teamId: 'desarrollo', quotedHours: 70 },
        { teamId: 'qa', quotedHours: 30 },
      ],
    });
    expect(plan.projectSoldHours).toBe(220);
    expect(plan.phase1AssignedHours).toBe(120);
    expect(plan.teamAllocations).toEqual([
      { teamId: 'desarrollo', phase1Hours: 90.5, quotationHours: 70,
        combinedHours: 160.5, existedBefore: true },
      { teamId: 'qa', phase1Hours: 0, quotationHours: 30,
        combinedHours: 30, existedBefore: false },
    ]);
    // "ux" no se actualiza porque no se incluyó en las asignaciones nuevas.
    expect(plan.teamAllocations.find((item) => item.teamId === 'ux')).toBeUndefined();
  });

  it('NULL sin horas declaradas no genera presupuestos ficticios', () => {
    const plan = planCommercialPreparationTransfer({
      previousSoldHours: 0, approvedQuotationHours: 40,
      existingTeams: [{ teamId: 'dev', assignedHours: null }],
      quotationTeams: [{ teamId: 'dev', quotedHours: 40 }],
    });
    expect(plan.teamAllocations[0]).toMatchObject({
      phase1Hours: 0, quotationHours: 40, combinedHours: 40,
      existedBefore: true,
    });
    expect(plan.projectSoldHours).toBe(40);
  });

  it('valida totales, precisión y ausencia de duplicados antes de escribir', () => {
    const base = {
      previousSoldHours: 20, approvedQuotationHours: 50,
      existingTeams: [{ teamId: 'dev', assignedHours: 20 }],
      quotationTeams: [{ teamId: 'dev', quotedHours: 40 }],
    };
    expect(() => planCommercialPreparationTransfer(base)).toThrow(/no concilian/);
    expect(() => planCommercialPreparationTransfer({
      ...base, approvedQuotationHours: 40,
      existingTeams: [...base.existingTeams, base.existingTeams[0]!],
    })).toThrow(/duplicado/);
    expect(() => planCommercialPreparationTransfer({
      ...base, approvedQuotationHours: 40, previousSoldHours: -1,
    })).toThrow(/no negativas/);
  });
});
