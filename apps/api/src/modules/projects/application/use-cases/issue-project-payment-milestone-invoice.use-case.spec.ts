import { describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '@kora/core';
import { IssueProjectPaymentMilestoneInvoiceUseCase } from './issue-project-payment-milestone-invoice.use-case';
import { Project } from '../../domain/entities/project.entity';
import {
  ProjectNotApprovedForInvoicingError,
  ProjectPaymentMilestoneAlreadyIssuedError,
} from '../../domain/errors/project.errors';
import type { ProjectPaymentMilestoneRecord, ProjectPaymentMilestoneRepository } from '../../domain/repositories/project-payment-milestone.repository';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectBillingSettingsRepository } from '../../domain/repositories/project-billing-settings.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { FixedClock } from '../../../../test/fakes';

const NOW = new Date('2026-09-24T00:00:00.000Z');
const ACTOR = { userId: 'finance-1', email: 'finance@kabeli.cl' };

function milestone(overrides: Partial<ProjectPaymentMilestoneRecord> = {}): ProjectPaymentMilestoneRecord {
  return {
    id: 'milestone-1',
    projectId: 'project-1',
    name: 'Inicio',
    percent: 50,
    amount: 1000,
    invoiceNumber: null,
    issuedAt: null,
    status: 'pending',
    paidAt: null,
    sortOrder: 0,
    ...overrides,
  };
}

function buildProject(overrides: { salesStage?: 'prospect' | 'quoted' | 'approved'; status?: 'draft' | 'on_hold' } = {}) {
  const salesStage = overrides.salesStage ?? 'approved';
  const project = Project.create({
    id: 'project-1',
    name: 'Portal',
    slug: 'portal',
    type: 'development',
    salesStage,
    status: salesStage === 'approved' ? 'draft' : undefined,
    now: NOW,
  }).unwrap();
  if (overrides.status === 'on_hold') project.changeStatus('on_hold', NOW);
  return project;
}

function buildUseCase(options: {
  milestone?: Partial<ProjectPaymentMilestoneRecord>;
  project?: ReturnType<typeof buildProject> | null;
  siblings?: ProjectPaymentMilestoneRecord[];
  autoActivateFirstPayment?: boolean;
}) {
  const target = milestone(options.milestone);
  const project = options.project === undefined ? buildProject() : options.project;

  const milestones = {
    findById: vi.fn().mockResolvedValue(target),
    listForProject: vi.fn().mockResolvedValue(options.siblings ?? [target]),
    markIssued: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectPaymentMilestoneRepository;

  const projects = {
    findById: vi.fn().mockResolvedValue(project),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectRepository;

  const billingSettings = {
    get: vi.fn().mockResolvedValue({ autoActivateFirstPayment: options.autoActivateFirstPayment ?? true, updatedAt: null }),
  } as unknown as ProjectBillingSettingsRepository;

  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const unitOfWork = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) } as unknown as UnitOfWork;

  const useCase = new IssueProjectPaymentMilestoneInvoiceUseCase(
    milestones,
    projects,
    billingSettings,
    audit,
    unitOfWork,
    new FixedClock(NOW),
  );

  return { useCase, milestones, projects, billingSettings };
}

describe('IssueProjectPaymentMilestoneInvoiceUseCase', () => {
  it('bloquea facturar si el proyecto de desarrollo no está Aprobado', async () => {
    const { useCase, milestones } = buildUseCase({ project: buildProject({ salesStage: 'quoted' }) });

    const result = await useCase.execute({
      milestoneId: 'milestone-1',
      data: { folio: 'F-1', issuedAt: '2026-09-24' },
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(ProjectNotApprovedForInvoicingError);
    expect(milestones.markIssued).not.toHaveBeenCalled();
  });

  it('rechaza un tramo que ya fue facturado', async () => {
    const { useCase } = buildUseCase({ milestone: { status: 'invoiced' } });

    const result = await useCase.execute({
      milestoneId: 'milestone-1',
      data: { folio: 'F-1', issuedAt: '2026-09-24' },
      actor: ACTOR,
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(ProjectPaymentMilestoneAlreadyIssuedError);
  });

  it('dispara Hito 0 (activa) al facturar el primer tramo de un proyecto Aprobado/No iniciado', async () => {
    const { useCase, projects } = buildUseCase({});

    const result = await useCase.execute({
      milestoneId: 'milestone-1',
      data: { folio: 'F-1', issuedAt: '2026-09-24' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect(projects.save).toHaveBeenCalledTimes(1);
    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.status).toBe('active');
    expect(saved.hito0Source).toBe('auto_invoice');
    expect(saved.hito0At).toEqual(NOW);
  });

  it('deja pendiente de aprobación de Gerencia si el interruptor global está apagado', async () => {
    const { useCase, projects } = buildUseCase({ autoActivateFirstPayment: false });

    const result = await useCase.execute({
      milestoneId: 'milestone-1',
      data: { folio: 'F-1', issuedAt: '2026-09-24' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.status).toBe('draft');
    expect(saved.pendingManagementApproval).toBe(true);
  });

  it('reactiva un proyecto Aprobado/Detenido sin tocar la fecha de Hito 0 original', async () => {
    const project = buildProject({ status: 'on_hold' });
    project.activateFromHito0(new Date('2026-01-10T00:00:00.000Z'), 'auto_invoice', null);
    project.changeStatus('on_hold', new Date('2026-01-10T00:00:00.000Z'));

    const { useCase, projects } = buildUseCase({ project });

    const result = await useCase.execute({
      milestoneId: 'milestone-1',
      data: { folio: 'F-2', issuedAt: '2026-09-24' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.status).toBe('active');
    expect(saved.hito0At).toEqual(new Date('2026-01-10T00:00:00.000Z'));
  });

  it('no dispara Hito 0 si el tramo facturado no es el primero (sortOrder mínimo)', async () => {
    const first = milestone({ id: 'milestone-0', sortOrder: 0, status: 'invoiced' });
    const second = milestone({ id: 'milestone-1', sortOrder: 1 });
    const { useCase, projects } = buildUseCase({ milestone: second, siblings: [first, second] });

    const result = await useCase.execute({
      milestoneId: 'milestone-1',
      data: { folio: 'F-1', issuedAt: '2026-09-24' },
      actor: ACTOR,
    });

    expect(result.isOk()).toBe(true);
    expect(projects.save).not.toHaveBeenCalled();
  });
});
