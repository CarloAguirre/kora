import { describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { quotationVersionSchema, quotationOperationalSnapshotSchema } from '@kora/contracts';
import { ManageQuotationDraftsUseCase } from './manage-quotation-drafts.use-case';
import type { QuotationRepository } from '../../domain/repositories/quotation.repository';

const id = {
  project: '0777e456-fd76-445e-83f1-afc25061c101',
  version: '0777e456-fd76-445e-83f1-afc25061c102',
  quotation: '0777e456-fd76-445e-83f1-afc25061c103',
  team: '0777e456-fd76-445e-83f1-afc25061c104',
  manager: '0777e456-fd76-445e-83f1-afc25061c105',
  leader: '0777e456-fd76-445e-83f1-afc25061c106',
};
const manager = { id: id.manager, permissions: ['projects:manage'] as const };
const version = quotationVersionSchema.parse({
  id: id.version, quotationId: id.quotation, versionNumber: 2,
  revision: 3, name: 'Cotización validable', status: 'draft', origin: 'manual',
  aiReviewStatus: null, createdByUserId: id.manager,
  hourlyRate: 1, currency: 'UF', tax: 'exempt',
  totalHours: 80, netAmount: 80, totalAmount: 80,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  draft: { mode: 'team', teams: [{ teamId: id.team, collaborators: 1, unit: 'week',
    duration: 2, hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [], costs: [],
    paymentPlan: [{ name: 'Pago único', percent: 100, trigger: 'approval' }],
    assumptions: [], exclusions: [], sourceRefs: [], answers: {},
  },
});
const operational = quotationOperationalSnapshotSchema.parse({
  projectId: id.project, status: 'draft', salesStage: 'quoted',
  soldHours: 0, usedHours: 0, startDate: null, contractAmount: null,
  contractCurrency: 'UF', teams: [], moduleCount: 0, taskCount: 0,
  segmentCount: 0, paymentMilestones: [],
});
const setup = () => {
  const repo = {
    getProjectScope: vi.fn().mockResolvedValue({
      id: id.project, type: 'development', salesStage: 'quoted',
      status: 'draft', leaderUserId: id.leader,
    }),
    getByProjectId: vi.fn().mockResolvedValue({
      id: id.quotation, projectId: id.project, versions: [version],
    }),
    getOperationalSnapshot: vi.fn().mockResolvedValue(operational),
    getTeamCatalogForQuotation: vi.fn().mockResolvedValue([
      { teamId: id.team, name: 'Desarrollo', isActive: true },
    ]),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
    appendReconciliationReview: vi.fn(),
    appendReconciliationAssessment: vi.fn(),
  } as unknown as QuotationRepository;
  return { useCase: new ManageQuotationDraftsUseCase(repo), repo };
};

describe('getCommercialPreflight · GET protegido', () => {
  it('revisa versión exacta sin métodos de escritura, aun con contenido válido', async () => {
    const { useCase, repo } = setup();
    const result = await useCase.getCommercialPreflight(id.project, id.version, manager);
    expect(result.versionId).toBe(id.version);
    expect(result.contentChecksPassed).toBe(true);
    expect(result.sendEnabled).toBe(false);
    expect(repo.getTeamCatalogForQuotation).toHaveBeenCalledWith([id.team]);
    expect(repo.createDraft).not.toHaveBeenCalled();
    expect(repo.updateDraft).not.toHaveBeenCalled();
    expect(repo.appendReconciliationReview).not.toHaveBeenCalled();
    expect(repo.appendReconciliationAssessment).not.toHaveBeenCalled();
  });

  it('líder ajeno no puede consultar cotización ni estado operativo', async () => {
    const { useCase, repo } = setup();
    await expect(useCase.getCommercialPreflight(id.project, id.version, {
      id: id.manager, permissions: ['projects:read_assigned'],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.getByProjectId).not.toHaveBeenCalled();
    expect(repo.getTeamCatalogForQuotation).not.toHaveBeenCalled();
  });

  it('líder asignado puede consultar la validación, pero no modificar estado', async () => {
    const { useCase, repo } = setup();
    const result = await useCase.getCommercialPreflight(id.project, id.version, {
      id: id.leader, permissions: ['projects:read_assigned'],
    });
    expect(result.sendEnabled).toBe(false);
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('versión ajena al proyecto se rechaza antes de leer operación y equipos', async () => {
    const { useCase, repo } = setup();
    await expect(useCase.getCommercialPreflight(id.project, id.manager, manager))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(repo.getOperationalSnapshot).not.toHaveBeenCalled();
    expect(repo.getTeamCatalogForQuotation).not.toHaveBeenCalled();
  });
});
