import { describe, expect, it } from 'vitest';
import {
  hasOnlyUntouchedDefaultPaymentMilestones,
  type ExistingProjectPaymentMilestone,
} from './default-payment-plan-eligibility';

const plan = (): ExistingProjectPaymentMilestone[] => [
  {
    name: 'Inicio', percent: '50.00', amount: '0.00',
    sortOrder: 0, triggerType: 'approval', triggerPhase: null, triggerDate: null,
    status: 'pending', invoiceNumber: null, issuedAt: null, dueAt: null, paidAt: null,
  },
  {
    name: 'Marcha blanca', percent: '50.00', amount: '0.00',
    sortOrder: 1, triggerType: 'phase', triggerPhase: 'pilot', triggerDate: null,
    status: 'pending', invoiceNumber: null, issuedAt: null, dueAt: null, paidAt: null,
  },
];

describe('Hitos predeterminados y aceptación de planificación inicial', () => {
  it('admite un proyecto sin hitos o con los dos hitos de creación intactos', () => {
    expect(hasOnlyUntouchedDefaultPaymentMilestones([])).toBe(true);
    const defaultPlan = plan();
    expect(hasOnlyUntouchedDefaultPaymentMilestones(defaultPlan)).toBe(true);
    expect(hasOnlyUntouchedDefaultPaymentMilestones(defaultPlan.reverse())).toBe(true);
  });

  it('bloquea cualquier pago, factura, monto pactado o cambio de estado', () => {
    for (const patch of [
      { status: 'to_invoice' },
      { status: 'invoiced' },
      { status: 'paid' },
      { amount: '1.00' },
      { invoiceNumber: 'F123' },
      { issuedAt: '2026-11-02' },
      { dueAt: '2026-12-02' },
      { paidAt: '2026-11-02' },
      { triggerDate: '2026-11-02' },
    ]) {
      const edited = plan();
      edited[0] = { ...edited[0]!, ...patch };
      expect(hasOnlyUntouchedDefaultPaymentMilestones(edited)).toBe(false);
    }
  });

  it('no permite un plan de cobro distinto o parcialmente modificado', () => {
    for (const patch of [
      { percent: '60.00' },
      { sortOrder: 2 },
      { triggerType: 'manual' },
      { triggerPhase: 'development' },
      { name: 'Firma' },
    ]) {
      const edited = plan();
      edited[1] = { ...edited[1]!, ...patch };
      expect(hasOnlyUntouchedDefaultPaymentMilestones(edited)).toBe(false);
    }
    expect(hasOnlyUntouchedDefaultPaymentMilestones(plan().slice(0, 1))).toBe(false);
    expect(hasOnlyUntouchedDefaultPaymentMilestones([...plan(), ...plan()])).toBe(false);
  });

  it('no modifica el plan original al verificarlo', () => {
    const rows = plan();
    const copy = structuredClone(rows);
    expect(hasOnlyUntouchedDefaultPaymentMilestones(rows)).toBe(true);
    expect(rows).toEqual(copy);
  });
});
