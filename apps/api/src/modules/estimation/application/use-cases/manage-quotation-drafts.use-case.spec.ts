import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ManageQuotationDraftsUseCase } from './manage-quotation-drafts.use-case';
import type { QuotationProjectScope, QuotationRepository } from '../../domain/repositories/quotation.repository';

const project = {
  id: '0777e456-fd76-445e-83f1-afc25061c101',
  type: 'development' as const, salesStage: 'quoted' as const, status: 'draft' as const,
  leaderUserId: '0777e456-fd76-445e-83f1-afc25061c102',
};
const manager = { id: '0777e456-fd76-445e-83f1-afc25061c103', permissions: ['projects:manage'] as const };
const leader = { id: project.leaderUserId, permissions: ['projects:read_assigned'] as const };
function setup(p: QuotationProjectScope = project) {
  const repository = {
    getProjectScope: vi.fn().mockResolvedValue(p),
    getByProjectId: vi.fn().mockResolvedValue(null),
    getOperationalSnapshot: vi.fn().mockResolvedValue(null),
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

  it('permite crear borradores en prospectos o cotizados activos, sin mutar Proyectos', async () => {
    for (const salesStage of ['prospect', 'quoted'] as const) {
      const { useCase, repository } = setup({ ...project, salesStage, status: 'active' });
      await expect(useCase.create(project.id, manager, {})).resolves.toBeDefined();
      expect(repository.createDraft).toHaveBeenCalledWith(project.id, manager.id, {});
    }
  });

  it('no altera permisos por estar activo: rechaza líderes ajenos', async () => {
    const { useCase } = setup({ ...project, status: 'active' });
    await expect(useCase.create(project.id,
      { id: manager.id, permissions: ['projects:read_assigned'] }, {}))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloquea escritura en finalizados, detenidos, cancelados y soporte', async () => {
    const denied: QuotationProjectScope[] = [
      { ...project, salesStage: 'quoted', status: 'finished' },
      { ...project, salesStage: 'prospect', status: 'cancelled' },
      { ...project, salesStage: 'quoted', status: 'on_hold' },
      { ...project, type: 'support', salesStage: 'quoted', status: 'active' },
    ];
    for (const deniedProject of denied) {
      const { useCase } = setup(deniedProject);
      await expect(useCase.create(project.id, manager, {})).rejects.toThrow();
    }
  });

  it('permite consultar historial comercial aunque el proyecto esté aprobado', async () => {
    const { useCase } = setup({ ...project, salesStage: 'approved', status: 'active' });
    await expect(useCase.get(project.id, manager)).resolves.toBeNull();
  });

  it('permite editar una versión draft de un proyecto active/quoted con revision', async () => {
    const { useCase, repository } = setup({ ...project, status: 'active' });
    const versionId = '0777e456-fd76-445e-83f1-afc25061c105';
    const input = {
      revision: 2, name: 'v2', hourlyRate: 2, currency: 'UF' as const, tax: 'iva19' as const,
      draft: { mode: 'team' as const, teams: [], phases: [], costs: [], paymentPlan: [],
        assumptions: [], exclusions: [], sourceRefs: [], answers: {} },
    };
    vi.mocked(repository.updateDraft).mockResolvedValueOnce({ id: versionId } as never);
    await expect(useCase.update(project.id, versionId, manager, input)).resolves.toBeDefined();
    expect(repository.updateDraft).toHaveBeenCalledWith(project.id, versionId, manager.id, input);
  });

  it('impide sobrescribir una versión ya modificada o bloqueada', async () => {
    const { useCase } = setup();
    await expect(useCase.update(project.id, '0777e456-fd76-445e-83f1-afc25061c105', manager, {
      revision: 1, name: 'v1', hourlyRate: null, currency: 'UF', tax: 'iva19',
      draft: { mode: 'team', teams: [], phases: [], costs: [], paymentPlan: [], assumptions: [], exclusions: [], sourceRefs: [], answers: {} },
    })).rejects.toBeInstanceOf(ConflictException);
  });

  it('R3 preflight: verifica permisos y no utiliza métodos de escritura', async () => {
    const { useCase, repository } = setup();
    const versionId = '0777e456-fd76-445e-83f1-afc25061c105';
    vi.mocked(repository.getByProjectId).mockResolvedValueOnce({
      id: '0777e456-fd76-445e-83f1-afc25061c106',
      projectId: project.id,
      versions: [{
        id: versionId,
        quotationId: '0777e456-fd76-445e-83f1-afc25061c106',
        versionNumber: 1, name: 'Borrador', status: 'draft', origin: 'manual',
        aiReviewStatus: null, revision: 1,
        createdByUserId: manager.id, hourlyRate: null, currency: 'UF', tax: 'iva19',
        draft: { mode: 'team', teams: [], phases: [], costs: [], paymentPlan: [],
          assumptions: [], exclusions: [], sourceRefs: [], answers: {} },
        totalHours: 0, netAmount: null, totalAmount: null,
        createdAt: '2026-10-30T12:00:00.000Z',
        updatedAt: '2026-10-30T12:00:00.000Z',
      }],
    });
    vi.mocked(repository.getOperationalSnapshot).mockResolvedValueOnce({
      projectId: project.id, salesStage: 'quoted', status: 'active',
      soldHours: 100, usedHours: 80, startDate: null,
      contractAmount: null, contractCurrency: 'UF', teams: [],
      moduleCount: 0, taskCount: 0, segmentCount: 0, paymentMilestones: [],
    });
    const result = await useCase.getTransferPreview(project.id, versionId, manager);
    expect(result.transferEnabled).toBe(false);
    expect(result.operational.usedHours).toBe(80);
    expect(repository.createDraft).not.toHaveBeenCalled();
    expect(repository.updateDraft).not.toHaveBeenCalled();
  });

  it('R3 preflight: un líder no asignado no puede consultar versiones ni estado operativo', async () => {
    const { useCase, repository } = setup();
    await expect(useCase.getTransferPreview(project.id, 'version', {
      id: manager.id, permissions: ['projects:read_assigned'],
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.getOperationalSnapshot).not.toHaveBeenCalled();
  });

  it('R3 preflight: no revela información operativa si la versión no pertenece al proyecto', async () => {
    const { useCase, repository } = setup();
    await expect(useCase.getTransferPreview(project.id, 'version', manager)).rejects.toThrow();
    expect(repository.getOperationalSnapshot).not.toHaveBeenCalled();
  });
  it('copia entre proyectos solo si el usuario tiene acceso a ambos proyectos', async () => {
    const otherId = '0777e456-fd76-445e-83f1-afc25061c111';
    const versionId = '0777e456-fd76-445e-83f1-afc25061c112';
    const { useCase, repository } = setup();
    await expect(useCase.create(project.id, manager, {
      sourceProjectId: otherId, sourceVersionId: versionId,
    })).resolves.toBeDefined();
    expect(repository.getProjectScope).toHaveBeenCalledWith(project.id);
    expect(repository.getProjectScope).toHaveBeenCalledWith(otherId);
    expect(repository.createDraft).toHaveBeenCalledWith(project.id, manager.id, {
      sourceProjectId: otherId, sourceVersionId: versionId,
    });

    const leaderAccess = setup();
    await expect(leaderAccess.useCase.create(project.id, leader, {
      sourceProjectId: otherId, sourceVersionId: versionId,
    })).resolves.toBeDefined();
    const outsider = setup();
    await expect(outsider.useCase.create(project.id, { id: manager.id,
      permissions: ['projects:read_assigned'] }, {
      sourceProjectId: otherId, sourceVersionId: versionId,
    })).rejects.toBeInstanceOf(ForbiddenException);
    expect(outsider.repository.createDraft).not.toHaveBeenCalled();
  });

  it('líder y Gerencia pueden generar IA en proyectos aprobados activos; bloquea históricos cerrados', async () => {
    const { useCase, repository } = setup();
    await expect(useCase.authorizeAiPoc(project.id, leader)).resolves.toBeUndefined();
    expect(repository.createAiPocDraft).toBeUndefined();
    const approved = setup({ ...project, salesStage: 'approved', status: 'active' });
    await expect(approved.useCase.authorizeAiPoc(project.id, manager)).resolves.toBeUndefined();
    const finished = setup({ ...project, salesStage: 'approved', status: 'finished' });
    await expect(finished.useCase.authorizeAiPoc(project.id, manager))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('bloquea el endpoint histórico de aceptación que escribía antes de aprobar al cliente', async () => {
    const versionId = '0777e456-fd76-445e-83f1-afc25061c105';
    const input = { revision: 3, confirmation: 'APLICAR_PLANIFICACION_KDM_DEMO' as const };
    const { useCase, repository } = setup();
    repository.applyPlanningBaseline = vi.fn();
    await expect(useCase.applyPlanningBaseline(project.id, versionId, leader, input))
      .rejects.toBeInstanceOf(ConflictException);
    await expect(useCase.applyPlanningBaseline(project.id, versionId, manager, input))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repository.applyPlanningBaseline).not.toHaveBeenCalled();
  });

  it('aceptar IA, registrar envío, aprobar cliente y traspasar verifican acceso al proyecto', async () => {
    const id = '0777e456-fd76-445e-83f1-afc25061c105';
    const { useCase, repository } = setup();
    repository.acceptAiProposal = vi.fn().mockResolvedValue({ id });
    repository.markSent = vi.fn().mockResolvedValue({ id });
    repository.approveClient = vi.fn().mockResolvedValue({ id });
    repository.transferApproved = vi.fn().mockResolvedValue({ versionId: id });
    await useCase.acceptAiProposal(project.id, id, leader, { revision: 1 });
    await useCase.markSent(project.id, id, leader, { revision: 2 });
    await useCase.approveClient(project.id, id, leader, {
      revision: 3, confirmation: 'CLIENTE_APROBO_ESTA_VERSION',
    });
    await useCase.transferApproved(project.id, id, leader, {
      revision: 4, confirmation: 'TRASPASAR_COTIZACION_APROBADA',
    });
    expect(repository.acceptAiProposal).toHaveBeenCalled();
    expect(repository.markSent).toHaveBeenCalled();
    expect(repository.approveClient).toHaveBeenCalled();
    expect(repository.transferApproved).toHaveBeenCalled();
    await expect(useCase.transferApproved(project.id, id, {
      id: manager.id, permissions: ['projects:read_assigned'],
    }, { revision: 4, confirmation: 'TRASPASAR_COTIZACION_APROBADA' }))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('solo permite leer planificación aplicada al gerente o líder asignado', async () => {
    const { useCase, repository } = setup();
    const getPlan = vi.fn().mockResolvedValue(null);
    repository.getAppliedPlanningBaseline = getPlan;
    expect(await useCase.getAppliedPlanningBaseline(project.id, leader)).toBeNull();
    await expect(useCase.getAppliedPlanningBaseline(project.id,
      { id: manager.id, permissions: ['projects:read_assigned'] }))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(getPlan).toHaveBeenCalledTimes(1);
  });


});
