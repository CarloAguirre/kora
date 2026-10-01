import { describe, expect, it, vi } from 'vitest';
import type { ListSupportBillingRowsQuery, SupportBillingRow } from '@kora/contracts';
import { ListSupportBillingRowsUseCase } from './list-support-billing-rows.use-case';
import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { SupportBillingRowBuilder } from '../services/support-billing-row-builder';
import { FixedClock } from '../../../../test/fakes';

const NOW = new Date('2026-10-01T12:00:00.000Z');

function plan(id: string, clientId: string, planType: SupportPlanRecord['planType']): SupportPlanRecord {
  return { id, clientId, planType, name: `Soporte ${id}` } as SupportPlanRecord;
}

/** Monto, alerta y estado "calculados" por contrato — el builder real no se prueba aquí, solo cuántos contratos se le piden. */
const COMPUTED: Record<string, Pick<SupportBillingRow, 'amountUf' | 'hasAlert'>> = {
  p1: { amountUf: 5, hasAlert: false },
  p2: { amountUf: 30, hasAlert: true },
  p3: { amountUf: 1, hasAlert: false },
  p4: { amountUf: 12, hasAlert: true },
};

const RECORDS = [plan('p1', 'c-gmc', 'monthly'), plan('p2', 'c-amicar', 'on_demand'), plan('p3', 'c-cristal', 'bundle'), plan('p4', 'c-bmw', 'monthly')];
const CLIENT_NAMES = new Map([
  ['c-gmc', 'GMC'],
  ['c-amicar', 'Amicar'],
  ['c-cristal', 'Cristal'],
  ['c-bmw', 'BMW'],
]);

function setup(records: SupportPlanRecord[] = RECORDS) {
  const plans = { listActive: vi.fn().mockResolvedValue(records) };
  const builder = {
    resolveClientNames: vi.fn().mockResolvedValue(CLIENT_NAMES),
    buildRows: vi.fn(async (subset: SupportPlanRecord[]) =>
      subset.map(
        (record) =>
          ({
            planId: record.id,
            planName: record.name ?? '',
            clientId: record.clientId,
            clientName: CLIENT_NAMES.get(record.clientId) ?? '',
            planType: record.planType,
            billingStatus: 'to_invoice',
            paymentStatus: null,
            isOverdue: false,
            ...COMPUTED[record.id],
          }) as SupportBillingRow,
      ),
    ),
  };
  const useCase = new ListSupportBillingRowsUseCase(
    plans as unknown as SupportPlanRepository,
    builder as unknown as SupportBillingRowBuilder,
    new FixedClock(NOW),
  );
  return { useCase, plans, builder };
}

function query(overrides: Partial<ListSupportBillingRowsQuery> = {}): ListSupportBillingRowsQuery {
  return { period: '2026-10', page: 1, pageSize: 2, sortField: 'client', sortDirection: 'asc', ...overrides };
}

describe('ListSupportBillingRowsUseCase', () => {
  it('pasa tipo y clientes al repositorio para filtrar en SQL', async () => {
    const { useCase, plans } = setup();
    await useCase.execute(query({ planType: 'monthly', clientId: ['c-gmc'] }));
    expect(plans.listActive).toHaveBeenCalledWith({ planType: 'monthly', clientIds: ['c-gmc'] });
  });

  it('orden por cliente: corta la página antes de calcular y solo calcula esos contratos', async () => {
    const { useCase, builder } = setup();
    const result = await useCase.execute(query({ page: 2 }));

    const page = result.unwrap();
    // Amicar, BMW | Cristal, GMC
    expect(page.items.map((row) => row.clientName)).toEqual(['Cristal', 'GMC']);
    expect(page.total).toBe(4);
    expect(page.pageCount).toBe(2);
    expect(builder.buildRows).toHaveBeenCalledTimes(1);
    expect(builder.buildRows.mock.calls[0]![0].map((record: SupportPlanRecord) => record.id)).toEqual(['p3', 'p1']);
  });

  it('orden por monto (campo calculado): calcula todos y ordena en el servidor', async () => {
    const { useCase, builder } = setup();
    const result = await useCase.execute(query({ sortField: 'amount', sortDirection: 'desc' }));

    const page = result.unwrap();
    expect(page.items.map((row) => row.amountUf)).toEqual([30, 12]);
    expect(page.total).toBe(4);
    expect(builder.buildRows.mock.calls[0]![0]).toHaveLength(4);
  });

  it('"Con alertas": el total cuenta solo los contratos con alerta', async () => {
    const { useCase } = setup();
    const result = await useCase.execute(query({ onlyAlerts: true, pageSize: 10 }));

    const page = result.unwrap();
    expect(page.items.map((row) => row.planId)).toEqual(['p2', 'p4']);
    expect(page.total).toBe(2);
  });

  it('sin contratos: página vacía con total 0', async () => {
    const { useCase } = setup([]);
    const result = await useCase.execute(query());
    expect(result.unwrap()).toMatchObject({ items: [], total: 0, pageCount: 0 });
  });
});
