import { describe, expect, it, vi } from 'vitest';
import { ListSupportPlansForClientUseCase } from './list-support-plans-for-client.use-case';
import type { SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { TicketClientReader, TicketClientReference } from '../ports/ticket-client-reader.port';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { TicketUserReader } from '../ports/ticket-user-reader.port';
import type { SupportPlanCurrentBillingResolver } from '../services/support-plan-current-billing.resolver';
import type { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { SupportMonthlyPeriodReconciler } from '../services/support-monthly-period-reconciler';
import { FixedClock } from '../../../../test/fakes';

class FakeSupportPlanRepository implements Partial<SupportPlanRepository> {
  listForClient = vi.fn().mockResolvedValue([]);
}

class FakeClientReader implements Partial<TicketClientReader> {
  constructor(private readonly clientsById: Map<string, TicketClientReference>) {}

  async findById(idOrSlug: string): Promise<TicketClientReference | null> {
    return this.clientsById.get(idOrSlug) ?? null;
  }
}

const NOW = new Date('2026-08-25T12:00:00.000Z');
const NEVER_USED_PROJECTS = {} as unknown as TicketProjectReader;
const NEVER_USED_USERS = {} as unknown as TicketUserReader;
const NEVER_USED_BILLING = {} as unknown as SupportPlanCurrentBillingResolver;
const NEVER_USED_BUILDER = {} as unknown as SupportPlanSummaryBuilder;
const NEVER_USED_PERIODS = {} as unknown as SupportMonthlyPeriodReconciler;

/**
 * `clientId` llega desde la URL como slug (ficha de cliente), no como UUID —
 * contra Postgres real `listForClient` revienta con "invalid input syntax
 * for type uuid" si recibe el slug crudo (columna `support_plans.client_id`).
 */
describe('ListSupportPlansForClientUseCase — resolución de slug en clientId', () => {
  function buildUseCase(plans: FakeSupportPlanRepository, clients: FakeClientReader) {
    return new ListSupportPlansForClientUseCase(
      plans as unknown as SupportPlanRepository,
      clients as unknown as TicketClientReader,
      NEVER_USED_PROJECTS,
      NEVER_USED_USERS,
      NEVER_USED_BILLING,
      NEVER_USED_BUILDER,
      NEVER_USED_PERIODS,
      new FixedClock(NOW),
    );
  }

  it('resuelve el slug del cliente a UUID antes de listar sus contratos', async () => {
    const plans = new FakeSupportPlanRepository();
    const clients = new FakeClientReader(new Map([['amicar', { id: 'client-uuid-1', companyName: 'Amicar', primaryContact: null }]]));
    const useCase = buildUseCase(plans, clients);

    await useCase.execute({ clientId: 'amicar' });

    expect(plans.listForClient).toHaveBeenCalledWith('client-uuid-1');
  });

  it('clientId que no resuelve a ningún cliente: lista vacía sin tocar support_plans', async () => {
    const plans = new FakeSupportPlanRepository();
    const clients = new FakeClientReader(new Map());
    const useCase = buildUseCase(plans, clients);

    const result = await useCase.execute({ clientId: 'no-existe' });

    expect(result.isOk() && result.value).toEqual([]);
    expect(plans.listForClient).not.toHaveBeenCalled();
  });
});
