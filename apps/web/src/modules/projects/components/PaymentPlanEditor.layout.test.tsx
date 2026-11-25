import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PaymentPlanEditor, type PaymentPlanDraft } from './PaymentPlanEditor';

/** Cada hito necesita exactamente 6 celdas para conservar la tabla
 * de la imagen de referencia en el drawer de 600px. */
describe('PaymentPlanEditor · disposición de tramos', () => {
  it('mantiene seis columnas aun con hitos vinculados a módulos comerciales', () => {
    const plan: PaymentPlanDraft = {
      contractAmount: '351.77',
      contractCurrency: 'UF',
      items: [
        {
          key: 'approval', name: 'Inicio', percent: '40', amount: '140.708',
          triggerType: 'approval', triggerPhase: '', triggerDate: '',
        },
        {
          key: 'legacy', name: 'Desarrollo', percent: '40', amount: '140.708',
          triggerType: 'phase', triggerPhase: '', triggerModuleId: '11111111-1111-4111-8111-111111111111',
          triggerDate: '',
        },
        {
          key: 'date', name: 'Entrega', percent: '20', amount: '70.354',
          triggerType: 'date', triggerPhase: '', triggerDate: '2026-12-01',
        },
      ],
    };
    render(<PaymentPlanEditor value={plan} onChange={vi.fn()} />);
    const rows = screen.getAllByRole('row');
    expect(rows).toHaveLength(4);
    // Encabezados: Tramo, %, Monto, Hito, Fase/fecha, acción.
    // Validar encabezado y tramos juntos, sin indexar un elemento que
    // TypeScript considera posiblemente indefinido con noUncheckedIndexedAccess.
    for (const row of rows) {
      expect(row.children).toHaveLength(6);
    }
    expect(screen.getByTitle(/Vinculado a módulo comercial/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Tramos del plan de pago' })).toBeInTheDocument();
  });
});
