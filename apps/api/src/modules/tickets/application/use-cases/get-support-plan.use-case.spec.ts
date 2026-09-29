import { describe, expect, it, vi } from 'vitest';
import { GetSupportPlanUseCase } from './get-support-plan.use-case';
import type { SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import type { TicketClientReader } from '../ports/ticket-client-reader.port';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import type { TicketUserReader } from '../ports/ticket-user-reader.port';
import type { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import type { SupportPlanCurrentBillingResolver } from '../services/support-plan-current-billing.resolver';
import type { SupportMonthlyPeriodReconciler } from '../services/support-monthly-period-reconciler';
import { FixedClock } from '../../../../test/fakes';

class FakeSupportPlanRepository implements Partial<SupportPlanRepository> {
  findById = vi.fn().mockResolvedValue(null);
  findBySlug = vi.fn().mockResolvedValue(null);
}

const NEVER_USED = {} as never;

function buildUseCase(plans: FakeSupportPlanRepository) {
  return new GetSupportPlanUseCase(
    plans as unknown as SupportPlanRepository,
    NEVER_USED as SupportInvoiceRepository,
    NEVER_USED as TicketClientReader,
    NEVER_USED as TicketProjectReader,
    NEVER_USED as TicketUserReader,
    NEVER_USED as SupportPlanSummaryBuilder,
    NEVER_USED as SupportPlanCurrentBillingResolver,
    NEVER_USED as SupportMonthlyPeriodReconciler,
    new FixedClock(),
  );
}

/** `GET /support-plans/:id` acepta UUID o slug. */
describe('GetSupportPlanUseCase — resolución por id o slug', () => {
  it('con un UUID, busca por id y no por slug', async () => {
    const plans = new FakeSupportPlanRepository();
    const useCase = buildUseCase(plans);

    await useCase.execute({ planId: '11111111-1111-4111-8111-111111111111' });

    expect(plans.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(plans.findBySlug).not.toHaveBeenCalled();
  });

  it('con un slug, busca por slug y no por id', async () => {
    const plans = new FakeSupportPlanRepository();
    const useCase = buildUseCase(plans);

    await useCase.execute({ planId: 'app-residentes' });

    expect(plans.findBySlug).toHaveBeenCalledWith('app-residentes');
    expect(plans.findById).not.toHaveBeenCalled();
  });
});
