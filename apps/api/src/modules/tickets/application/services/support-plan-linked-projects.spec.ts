import { describe, expect, it } from 'vitest';
import { resolveSupportPlanHourProjectIds, resolveSupportPlanProjectIds } from './support-plan-linked-projects';
import type { SupportPlanRecord, SupportPlanRepository } from '../../domain/repositories/support-plan.repository';

function repo(linked: string[]): SupportPlanRepository {
  return { listLinkedProjectIds: async () => linked } as unknown as SupportPlanRepository;
}

const plan = (projectId: string | null) => ({ id: 'plan-1', projectId }) as SupportPlanRecord;

describe('proyectos de un contrato de soporte', () => {
  it('legado (sin enlaces): cubre y consume solo su proyecto de soporte', async () => {
    expect(await resolveSupportPlanProjectIds(repo([]), plan('support-1'))).toEqual(['support-1']);
    expect(await resolveSupportPlanHourProjectIds(repo([]), plan('support-1'))).toEqual(['support-1']);
  });

  it('con enlaces y contenedor: muestra los cubiertos, pero consume también las HH del contenedor', async () => {
    expect(await resolveSupportPlanProjectIds(repo(['app-2', 'app-3']), plan('support-1'))).toEqual(['app-2', 'app-3']);
    expect(await resolveSupportPlanHourProjectIds(repo(['app-2', 'app-3']), plan('support-1'))).toEqual(['support-1', 'app-2', 'app-3']);
  });

  it('con enlaces y sin contenedor: consume solo los cubiertos', async () => {
    expect(await resolveSupportPlanHourProjectIds(repo(['app-2']), plan(null))).toEqual(['app-2']);
  });
});
