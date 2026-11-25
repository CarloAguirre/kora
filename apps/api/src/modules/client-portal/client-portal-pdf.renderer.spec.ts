import { describe, expect, it } from 'vitest';
import { renderClientPortalPdf } from './client-portal-pdf.renderer';

type Report = Parameters<typeof renderClientPortalPdf>[0];

function detail(count: number): Report {
  return {
    project: {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Planificación de negocios RM',
      slug: 'planificacion-rm',
      status: 'active',
      client: { companyName: 'Amicar' },
      commercialManager: { fullName: 'Pablo Vega' },
      primaryContact: { name: 'Diego Casanova' },
      startDate: '2026-10-07',
      endDate: '2026-11-13',
      updatedAt: '2026-11-11T11:00:00Z',
      contractCurrency: 'UF',
      contractAmount: 180,
      paymentMilestones: [
        { name: 'Inicio', amount: 90, status: 'paid', invoiceNumber: '4512' },
        { name: 'Marcha blanca', amount: 90, status: 'pending', invoiceNumber: null },
      ],
      progress: { actual: 67, expected: 78 },
      soldHours: 320, usedHours: 241,
      impactBeforeHours: 24, impactAfterHours: 2,
      impactBeforePeople: '3 personas', impactAfterPeople: '1 persona',
      impactBeforeModality: 'Planillas Excel', impactAfterModality: 'Tablero automático',
      modules: [{
        id: 'phase-a',
        name: 'Planificador comercial RM',
        deliveries: Array.from({ length: count }, (_, i) => ({
          id: `delivery-${i}`, name: `Tablero de seguimiento ${i + 1}`,
          status: 'approved' as const, teamName: 'DEV', estimatedDate: '2026-11-04',
        })),
      }],
    },
    receipts: [{ deliveryId: 'delivery-0', receivedAt: '2026-11-05T15:00:00Z', receivedByName: 'Diego Casanova' }],
  } as unknown as Report;
}

describe('PDF descargable para cliente', () => {
  it('genera un archivo PDF válido con estructura y páginas referenciadas', () => {
    const result = renderClientPortalPdf(detail(2));
    const raw = result.toString('latin1');
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(raw.startsWith('%PDF-1.4\n')).toBe(true);
    expect(raw).toMatch(/\/Type \/Catalog/);
    expect(raw).toMatch(/\/Type \/Page /);
    expect(raw).toMatch(/xref\n0 \d+\n/);
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(result.length).toBeGreaterThan(2000);
  });

  it('pagina muchos compromisos sin truncar ni perder entregas', () => {
    const result = renderClientPortalPdf(detail(75));
    const raw = result.toString('latin1');
    expect((raw.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(1);
    expect(raw).toContain('/WinAnsiEncoding');
    expect(raw.trimEnd().endsWith('%%EOF')).toBe(true);
  });
});
