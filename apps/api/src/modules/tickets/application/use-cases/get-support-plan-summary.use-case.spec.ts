import { describe, expect, it, vi } from 'vitest';
import { GetSupportPlanSummaryUseCase } from './get-support-plan-summary.use-case';
import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { TicketProjectReader, TicketProjectReference } from '../ports/ticket-project-reader.port';
import type { SupportPlanSummaryBuilder } from '../services/support-plan-summary-builder';
import { FixedClock } from '../../../../test/fakes';

class FakeSupportPlanRepository implements Partial<SupportPlanRepository> {
  findActiveForProjectOrLinked = vi.fn().mockResolvedValue(null);
}

class FakeProjectReader implements Partial<TicketProjectReader> {
  constructor(private readonly projectsById: Map<string, TicketProjectReference>) {}

  async findById(idOrSlug: string): Promise<TicketProjectReference | null> {
    return this.projectsById.get(idOrSlug) ?? null;
  }
}

const NOW = new Date('2026-08-25T12:00:00.000Z');
const NEVER_USED_BUILDER = {} as unknown as SupportPlanSummaryBuilder;

/**
 * `projectId` llega desde la URL como slug (`SupportProjectDetailView`), no
 * como UUID — contra Postgres real `findActiveForProjectOrLinked` revienta
 * con "invalid input syntax for type uuid" si recibe el slug crudo (columna
 * `support_plans.project_id`). Estos tests fijan el contrato: se resuelve
 * antes de tocar el repositorio.
 */
describe('GetSupportPlanSummaryUseCase — resolución de slug en projectId', () => {
  it('resuelve el slug del proyecto a UUID antes de buscar el plan', async () => {
    const plans = new FakeSupportPlanRepository();
    const projects = new FakeProjectReader(
      new Map([['soporte-siegfried', { id: 'project-uuid-1', name: 'Soporte Siegfried', status: 'active', type: 'support', clientId: null }]]),
    );
    const useCase = new GetSupportPlanSummaryUseCase(
      plans as unknown as SupportPlanRepository,
      projects as unknown as TicketProjectReader,
      NEVER_USED_BUILDER,
      new FixedClock(NOW),
    );

    await useCase.execute({ projectId: 'soporte-siegfried' });

    expect(plans.findActiveForProjectOrLinked).toHaveBeenCalledWith('project-uuid-1');
  });

  it('projectId que no resuelve a ningún proyecto: null sin tocar support_plans', async () => {
    const plans = new FakeSupportPlanRepository();
    const projects = new FakeProjectReader(new Map());
    const useCase = new GetSupportPlanSummaryUseCase(
      plans as unknown as SupportPlanRepository,
      projects as unknown as TicketProjectReader,
      NEVER_USED_BUILDER,
      new FixedClock(NOW),
    );

    const result = await useCase.execute({ projectId: 'no-existe' });

    expect(result.isOk() && result.value).toBeNull();
    expect(plans.findActiveForProjectOrLinked).not.toHaveBeenCalled();
  });

  it('incluye el id del contrato activo para poder cerrarlo desde la ficha', async () => {
    const plans = new FakeSupportPlanRepository();
    plans.findActiveForProjectOrLinked.mockResolvedValue({ id: 'plan-uuid-1' } as SupportPlanRecord);
    const projects = new FakeProjectReader(
      new Map([['soporte-casa-andina', { id: 'project-uuid-1', name: 'Soporte Casa Andina', status: 'active', type: 'support', clientId: 'client-uuid-1' }]]),
    );
    const summaryBuilder = {
      resolveLinkedProjectIds: vi.fn().mockResolvedValue([]),
      build: vi.fn().mockResolvedValue({ planType: 'monthly', contractedHours: 50 }),
    } as unknown as SupportPlanSummaryBuilder;
    const useCase = new GetSupportPlanSummaryUseCase(
      plans as unknown as SupportPlanRepository,
      projects as unknown as TicketProjectReader,
      summaryBuilder,
      new FixedClock(NOW),
    );

    const result = await useCase.execute({ projectId: 'soporte-casa-andina' });

    expect(result.isOk() && result.value).toMatchObject({ planId: 'plan-uuid-1', planType: 'monthly', contractedHours: 50 });
    expect(summaryBuilder.build).toHaveBeenCalledWith(expect.objectContaining({ id: 'plan-uuid-1' }), [], NOW);
  });
});
