import { describe, expect, it, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  buildReconciliationReview,
  estimationAnalysisArtifactSchema,
  quotationOperationalSnapshotSchema,
  quotationVersionSchema,
} from '@kora/contracts';
import { buildQuotationTransferPreview } from '../../domain/quotation-transfer-preview';
import { ManageQuotationDraftsUseCase } from './manage-quotation-drafts.use-case';
import type { QuotationRepository } from '../../domain/repositories/quotation.repository';

const ids = {
  project: '0777e456-fd76-445e-83f1-afc25061c101',
  user: '0777e456-fd76-445e-83f1-afc25061c102',
  outsider: '0777e456-fd76-445e-83f1-afc25061c103',
  quotation: '0777e456-fd76-445e-83f1-afc25061c104',
  version: '0777e456-fd76-445e-83f1-afc25061c105',
  team: '0777e456-fd76-445e-83f1-afc25061c106',
  module: '0777e456-fd76-445e-83f1-afc25061c107',
  task: '0777e456-fd76-445e-83f1-afc25061c108',
  differentTask: '0777e456-fd76-445e-83f1-afc25061c109',
  savedEvent: '0777e456-fd76-445e-83f1-afc25061c110',
};
const actor = { id: ids.user, permissions: ['projects:manage'] as const };
const analysis = estimationAnalysisArtifactSchema.parse({
  schemaVersion: 'kora.estimation.analysis.v1',
  provenance: {
    mode: 'simulated_fixture', provider: null, model: null,
    label: 'Fixture QA', warning: 'Sin Gemini',
    sourceFiles: [{ id: 'edt', name: 'EDT.xlsx', kind: 'edt', sha256: 'a'.repeat(64) }],
  },
  project: { name: 'Portal', client: 'QA', objective: 'Prueba' },
  scope: { included: ['Portal'], excluded: [], validationStatus: 'ejemplo' },
  sourceRequirements: [], userStories: [], pendingDecisions: [],
  roles: [{ role: 'Fullstack', headcount: 1, baseHours: 8 }],
  modules: [{ name: 'Portal', activityCount: 1, totalHours: 8, hoursByRole: { Fullstack: 8 } }],
  tranches: [{ id: 'T01', name: 'Construcción', startWeek: 1, durationWeeks: 1,
    totalHours: 8, hoursByRole: { Fullstack: 8 } }],
  activities: [{ wbs: 'T01.01', trancheId: 'T01', module: 'Portal',
    description: 'Crear endpoint', requirementIds: [], sourceClassification: 'C',
    responsibleRole: 'Fullstack', hoursByRole: { Fullstack: 8 }, totalHours: 8 }],
  dailyPlan: [], weeklyPlan: [], milestones: [], assumptions: [],
  summary: { baseHours: 8, reservePercent: 10, reserveHours: 0.8,
    hoursWithReserve: 8.8, durationWorkingDays: 1, hoursByRole: { Fullstack: 8 } },
  commercial: { hourlyRate: null, currency: null, tax: null, paymentPlan: [] },
  roleTeamMappings: { status: 'mapped_to_kora_teams', suggestions: {} },
  renderBlueprints: { ers: [], edt: [] },
});
const version = quotationVersionSchema.parse({
  id: ids.version, quotationId: ids.quotation,
  versionNumber: 1, name: 'Simulación', revision: 3,
  status: 'draft', origin: 'ai', aiReviewStatus: 'pending',
  createdByUserId: ids.user, hourlyRate: null, currency: 'UF', tax: 'iva19',
  totalHours: 8, netAmount: null, totalAmount: null,
  createdAt: '2026-10-30T12:00:00.000Z',
  updatedAt: '2026-10-30T12:00:00.000Z',
  draft: {
    mode: 'phases', teams: [{ teamId: ids.team, collaborators: 1, unit: 'week',
      duration: 1, hoursPerWeek: 40, dedicationPercent: 20 }],
    phases: [{ name: 'Portal', startWeek: 1, durationWeeks: 1,
      teamHours: [{ teamId: ids.team, hours: 8 }] }],
    costs: [], paymentPlan: [], assumptions: [], exclusions: [],
    sourceRefs: [], answers: {}, analysis, analysisProjectionStatus: 'synced',
  },
});
const operational = quotationOperationalSnapshotSchema.parse({
  projectId: ids.project, salesStage: 'quoted', status: 'active',
  soldHours: 12, usedHours: 5, startDate: null,
  contractAmount: null, contractCurrency: 'UF',
  teams: [{ teamId: ids.team, name: 'Desarrollo', assignedHours: 12, memberLimit: 1 }],
  moduleCount: 1, taskCount: 1, segmentCount: 0, paymentMilestones: [{ status: 'paid', amount: 200 }],
  executionModules: [{ id: ids.module, name: 'Portal', estimatedHours: 10,
    tasks: [{ id: ids.task, name: 'Crear endpoint', status: 'done', estimatedHours: 10 }],
  }],
});
const makeReview = () => {
  const preview = buildQuotationTransferPreview(version, operational, '2026-10-30T18:00:00.000Z');
  return buildReconciliationReview(preview, {
    modules: { 0: { decision: 'link_existing', targetId: ids.module, note: 'Revisar sin reemplazar' } },
    activities: { 'T01.01': {
      decision: 'link_existing', targetId: ids.task, note: 'Tarea histórica',
    } },
  }, '2026-10-30T18:05:00.000Z');
};

function setup() {
  const repo = {
    getProjectScope: vi.fn().mockResolvedValue({
      id: ids.project, type: 'development', salesStage: 'quoted',
      status: 'active', leaderUserId: ids.user,
    }),
    getByProjectId: vi.fn().mockResolvedValue({ id: ids.quotation, projectId: ids.project, versions: [version] }),
    getOperationalSnapshot: vi.fn().mockResolvedValue(operational),
    listReconciliationReviews: vi.fn().mockResolvedValue([]),
    listReconciliationAssessments: vi.fn().mockResolvedValue([]),
    appendReconciliationAssessment: vi.fn().mockImplementation(async (_p, versionId, reviewerId, input) => ({
      id: '0777e456-fd76-445e-83f1-afc25061c111',
      reviewId: input.reviewId, versionId,
      versionRevision: input.versionRevision, reviewerUserId: reviewerId,
      decision: input.decision, reason: input.reason,
      status: 'technical_review_only', transferEnabled: false,
      occurredAt: '2026-10-30T18:15:00.000Z',
    })),
    appendReconciliationReview: vi.fn().mockImplementation(async (_p, _v, actorId, review) => ({
      id: ids.savedEvent, actorUserId: actorId,
      occurredAt: '2026-10-30T18:06:00.000Z', review,
    })),
    createDraft: vi.fn(),
    updateDraft: vi.fn(),
  } as unknown as QuotationRepository;
  return { useCase: new ManageQuotationDraftsUseCase(repo), repo };
}

describe('R3-d — actas persistidas sin mutaciones operativas', () => {
  it('guarda únicamente un acta canónica y preserva su autor y la revisión comercial', async () => {
    const { useCase, repo } = setup();
    const review = makeReview();
    const result = await useCase.saveReconciliationReview(ids.project, ids.version, actor, review);
    expect(result.review.status).toBe('draft_for_discussion');
    expect(result.review.transferEnabled).toBe(false);
    expect(result.review.versionRevision).toBe(3);
    expect(result.actorUserId).toBe(ids.user);
    expect(repo.appendReconciliationReview).toHaveBeenCalledWith(
      ids.project, ids.version, ids.user, review,
    );
    expect(repo.createDraft).not.toHaveBeenCalled();
    expect(repo.updateDraft).not.toHaveBeenCalled();
  });

  it('rechaza modificaciones ocultas de HH, advertencias o IDs ajenos al proyecto', async () => {
    const { useCase, repo } = setup();
    const malicious = makeReview();
    malicious.issues = [];
    await expect(useCase.saveReconciliationReview(ids.project, ids.version, actor, malicious))
      .rejects.toBeInstanceOf(ConflictException);

    const foreign = makeReview();
    foreign.moduleDecisions[0]!.targetModuleId = ids.differentTask;
    await expect(useCase.saveReconciliationReview(ids.project, ids.version, actor, foreign))
      .rejects.toBeInstanceOf(ConflictException);

    const missing = makeReview();
    missing.moduleDecisions[0]!.activityDecisions[0]!.edtHours = 999;
    await expect(useCase.saveReconciliationReview(ids.project, ids.version, actor, missing))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repo.appendReconciliationReview).not.toHaveBeenCalled();
  });

  it('impide actas de versión/revisión incorrecta, o del proyecto ya actualizado', async () => {
    const { useCase, repo } = setup();
    const bad = makeReview();
    bad.versionRevision = 4;
    await expect(useCase.saveReconciliationReview(ids.project, ids.version, actor, bad))
      .rejects.toBeInstanceOf(ConflictException);

    const oldState = makeReview();
    vi.mocked(repo.getOperationalSnapshot).mockResolvedValueOnce({
      ...operational, usedHours: 10,
    });
    await expect(useCase.saveReconciliationReview(ids.project, ids.version, actor, oldState))
      .rejects.toBeInstanceOf(ConflictException);
  });

  it('controla permisos: el líder ajeno no puede consultar ni registrar actas', async () => {
    const { useCase, repo } = setup();
    const outsider = { id: ids.outsider, permissions: ['projects:read_assigned'] as const };
    await expect(useCase.listReconciliationReviews(ids.project, ids.version, outsider))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(useCase.saveReconciliationReview(ids.project, ids.version, outsider, makeReview()))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.listReconciliationReviews).not.toHaveBeenCalled();
    expect(repo.appendReconciliationReview).not.toHaveBeenCalled();
  });

  it('permite leer historial de una versión y rechaza versiones ajenas', async () => {
    const { useCase, repo } = setup();
    await expect(useCase.listReconciliationReviews(ids.project, ids.version, actor))
      .resolves.toEqual([]);
    expect(repo.listReconciliationReviews).toHaveBeenCalledWith(ids.project, ids.version);
    await expect(useCase.listReconciliationReviews(ids.project, ids.differentTask, actor))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('no acepta guardar actas cuando el proyecto no es elegible para un borrador', async () => {
    const { useCase, repo } = setup();
    vi.mocked(repo.getProjectScope).mockResolvedValueOnce({
      id: ids.project, type: 'development', salesStage: 'approved',
      status: 'active', leaderUserId: ids.user,
    });
    await expect(useCase.saveReconciliationReview(ids.project, ids.version, actor, makeReview()))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repo.appendReconciliationReview).not.toHaveBeenCalled();
  });
});


describe('R3-e — evaluación técnica sin aprobación comercial', () => {
  const reviewer = { id: ids.outsider, permissions: ['projects:manage'] as const };
  const saved = () => ({
    id: ids.savedEvent, actorUserId: ids.user,
    occurredAt: '2026-10-30T18:06:00.000Z',
    review: makeReview(),
  });
  const input = () => ({
    reviewId: ids.savedEvent, versionRevision: 3,
    decision: 'reviewed_for_discussion' as const,
    reason: 'Correspondencias WBS revisadas; conservar horas y facturación.',
  });

  it('registra evaluación técnica de otro administrador, sin aprobar ni actualizar cotización', async () => {
    const { useCase, repo } = setup();
    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([saved()]);
    const result = await useCase.assessReconciliationReview(ids.project, ids.version, reviewer, input());
    expect(result.status).toBe('technical_review_only');
    expect(result.transferEnabled).toBe(false);
    expect(result.decision).toBe('reviewed_for_discussion');
    expect(result.reviewerUserId).toBe(ids.outsider);
    expect(repo.appendReconciliationAssessment).toHaveBeenCalledWith(
      ids.project, ids.version, ids.outsider, input(),
    );
    expect(repo.updateDraft).not.toHaveBeenCalled();
    expect(repo.createDraft).not.toHaveBeenCalled();
  });

  it('no permite autoevaluar el acta, ni deja usar permisos solo de líder', async () => {
    const { useCase, repo } = setup();
    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([saved()]);
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, actor, input()))
      .rejects.toBeInstanceOf(ForbiddenException);
    const leader = { id: ids.user, permissions: ['projects:read_assigned'] as const };
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, leader, input()))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.appendReconciliationAssessment).not.toHaveBeenCalled();
  });

  it('impide evaluar actas antiguas o ya evaluadas', async () => {
    const { useCase, repo } = setup();
    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([{
      ...saved(), id: ids.differentTask,
    }]);
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, reviewer, input()))
      .rejects.toBeInstanceOf(ConflictException);

    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([saved()]);
    vi.mocked(repo.listReconciliationAssessments).mockResolvedValueOnce([{
      id: '0777e456-fd76-445e-83f1-afc25061c111',
      reviewId: ids.savedEvent, versionId: ids.version, versionRevision: 3,
      reviewerUserId: ids.outsider, occurredAt: '2026-10-30T18:15:00.000Z',
      decision: 'changes_requested', reason: 'Prueba de evaluación previa.',
      status: 'technical_review_only', transferEnabled: false,
    }]);
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, reviewer, input()))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repo.appendReconciliationAssessment).not.toHaveBeenCalled();
  });

  it('si cambia el estado operativo desde guardar el acta exige una nueva revisión', async () => {
    const { useCase, repo } = setup();
    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([saved()]);
    vi.mocked(repo.getOperationalSnapshot).mockResolvedValueOnce({
      ...operational, usedHours: operational.usedHours + 5,
    });
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, reviewer, input()))
      .rejects.toBeInstanceOf(ConflictException);
    expect(repo.appendReconciliationAssessment).not.toHaveBeenCalled();
  });

  it('solicitar cambios es válido para actas incompletas; revisada para discusión no', async () => {
    const { useCase, repo } = setup();
    const pending = saved();
    pending.review.moduleDecisions[0]!.decision = 'pending';
    pending.review.moduleDecisions[0]!.targetModuleId = null;
    // Con un acta incompleta CANÓNICA, la evaluación técnica solicita cambios.
    const preview = buildQuotationTransferPreview(version, operational, '2026-10-30T18:00:00.000Z');
    const incompleteReview = buildReconciliationReview(preview, {
      modules: {}, activities: {},
    }, '2026-10-30T18:05:00.000Z');
    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([{
      ...saved(), review: incompleteReview,
    }]);
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, reviewer, input()))
      .rejects.toBeInstanceOf(ConflictException);

    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([{
      ...saved(), review: incompleteReview,
    }]);
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, reviewer, {
      ...input(), decision: 'changes_requested',
    })).resolves.toMatchObject({
      status: 'technical_review_only', decision: 'changes_requested', transferEnabled: false,
    });
  });

  it('exige mantener la revisión comercial y permite consultar historial con autorización', async () => {
    const { useCase, repo } = setup();
    vi.mocked(repo.listReconciliationReviews).mockResolvedValueOnce([saved()]);
    await expect(useCase.assessReconciliationReview(ids.project, ids.version, reviewer, {
      ...input(), versionRevision: 999,
    })).rejects.toBeInstanceOf(ConflictException);
    await expect(useCase.listReconciliationAssessments(ids.project, ids.version, reviewer))
      .resolves.toEqual([]);
    expect(repo.listReconciliationAssessments).toHaveBeenCalled();
  });
});
