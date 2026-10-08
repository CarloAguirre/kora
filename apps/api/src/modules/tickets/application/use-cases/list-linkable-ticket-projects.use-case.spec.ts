import { describe, expect, it, vi } from 'vitest';
import { ListLinkableTicketProjectsUseCase } from './list-linkable-ticket-projects.use-case';
import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { TicketProjectReader, TicketProjectReference } from '../ports/ticket-project-reader.port';

function plan(overrides: Partial<SupportPlanRecord>): SupportPlanRecord {
  return { id: 'plan-1', projectId: null, scope: 'single', status: 'active', name: null, ...overrides } as SupportPlanRecord;
}

function devProject(id: string, name: string): TicketProjectReference {
  return { id, name, status: 'finished', type: 'development', clientId: 'client-1' };
}

function buildUseCase(input: {
  linkable: { id: string; name: string }[];
  plans: SupportPlanRecord[];
  linkedByPlan: Record<string, string[]>;
  projects: TicketProjectReference[];
}) {
  const projects = {
    findLinkableByClient: vi.fn().mockResolvedValue(input.linkable),
    findManyByIds: vi.fn(async (ids: readonly string[]) => input.projects.filter((project) => ids.includes(project.id))),
  };
  const plans = {
    listForClient: vi.fn().mockResolvedValue(input.plans),
    listLinkedProjectIds: vi.fn(async (planId: string) => input.linkedByPlan[planId] ?? []),
  };
  const useCase = new ListLinkableTicketProjectsUseCase(
    projects as unknown as TicketProjectReader,
    plans as unknown as SupportPlanRepository,
  );
  return { useCase, plans };
}

/**
 * Los contratos creados desde la v2 no tienen proyecto "contenedor" de
 * soporte (`support_plans.project_id` nulo): sin sumar sus proyectos de
 * desarrollo cubiertos, el selector "Proyecto" del modal de ticket no los
 * ofrecía y no había forma de abrirles un ticket.
 */
describe('ListLinkableTicketProjectsUseCase', () => {
  it('soporte: suma los proyectos cubiertos por contratos v2 activos, con el nombre del contrato', async () => {
    const { useCase } = buildUseCase({
      linkable: [{ id: 'support-legacy', name: 'Soporte Legado' }],
      plans: [
        plan({ id: 'single', name: 'Soporte App 1' }),
        plan({ id: 'consolidated', scope: 'consolidated', name: 'Soporte Abarca Motores' }),
      ],
      linkedByPlan: { single: ['app-1'], consolidated: ['app-2', 'app-3'] },
      projects: [devProject('app-1', 'App 1'), devProject('app-2', 'App 2'), devProject('app-3', 'App 3')],
    });

    const result = await useCase.execute({ clientId: 'client-1', type: 'support' });

    expect(result.isOk() && result.value).toEqual([
      { id: 'app-2', name: 'Soporte Abarca Motores · App 2' },
      { id: 'app-3', name: 'Soporte Abarca Motores · App 3' },
      { id: 'app-1', name: 'Soporte App 1' },
      { id: 'support-legacy', name: 'Soporte Legado' },
    ]);
  });

  it('soporte: ignora contratos terminados o cancelados', async () => {
    const { useCase } = buildUseCase({
      linkable: [],
      plans: [plan({ id: 'ended', status: 'ended', name: 'Viejo' }), plan({ id: 'cancelled', status: 'cancelled', name: 'Cancelado' })],
      linkedByPlan: { ended: ['app-1'], cancelled: ['app-2'] },
      projects: [devProject('app-1', 'App 1'), devProject('app-2', 'App 2')],
    });

    const result = await useCase.execute({ clientId: 'client-1', type: 'support' });

    expect(result.isOk() && result.value).toEqual([]);
  });

  it('desarrollo: no consulta contratos', async () => {
    const { useCase, plans } = buildUseCase({ linkable: [{ id: 'app-1', name: 'App 1' }], plans: [], linkedByPlan: {}, projects: [] });

    const result = await useCase.execute({ clientId: 'client-1', type: 'development' });

    expect(result.isOk() && result.value).toEqual([{ id: 'app-1', name: 'App 1' }]);
    expect(plans.listForClient).not.toHaveBeenCalled();
  });
});
