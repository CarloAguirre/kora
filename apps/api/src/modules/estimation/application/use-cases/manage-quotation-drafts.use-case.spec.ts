import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ManageQuotationDraftsUseCase } from './manage-quotation-drafts.use-case';
import type { QuotationRepository } from '../../domain/repositories/quotation.repository';

const project = {
  id: '0777e456-fd76-445e-83f1-afc25061c101',
  type: 'development' as const, salesStage: 'quoted' as const, status: 'draft' as const,
  leaderUserId: '0777e456-fd76-445e-83f1-afc25061c102',
};
const manager = { id: '0777e456-fd76-445e-83f1-afc25061c103', permissions: ['projects:manage'] as const };
const leader = { id: project.leaderUserId, permissions: ['projects:read_assigned'] as const };
function setup(p = project) {
  const repository = {
    getProjectScope: vi.fn().mockResolvedValue(p),
    getByProjectId: vi.fn().mockResolvedValue(null),
    createDraft: vi.fn().mockResolvedValue({ id: 'version' }),
    updateDraft: vi.fn().mockResolvedValue(null),
  } as unknown as QuotationRepository;
  return { useCase: new ManageQuotationDraftsUseCase(repository), repository };
}

describe('ManageQuotationDraftsUseCase', () => {
  it('permite a gerente y líder asignado, pero no a otro líder', async () => {
    const { useCase } = setup();
    await expect(useCase.create(project.id, manager, {})).resolves.toBeDefined();
    await expect(useCase.create(project.id, leader, {})).resolves.toBeDefined();
    await expect(useCase.create(project.id, { id: manager.id, permissions: ['projects:read_assigned'] }, {}))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('no crea nuevos borradores cuando el proyecto está activo', async () => {
    const { useCase } = setup({ ...project, status: 'active' as const });
    await expect(useCase.create(project.id, manager, {})).rejects.toBeInstanceOf(ConflictException);
  });

  it('impide sobrescribir una versión ya modificada o bloqueada', async () => {
    const { useCase } = setup();
    await expect(useCase.update(project.id, '0777e456-fd76-445e-83f1-afc25061c105', manager, {
      revision: 1, name: 'v1', hourlyRate: null, currency: 'UF', tax: 'iva19',
      draft: { mode: 'team', teams: [], phases: [], costs: [], paymentPlan: [], assumptions: [], exclusions: [], sourceRefs: [], answers: {} },
    })).rejects.toBeInstanceOf(ConflictException);
  });
});
