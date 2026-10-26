import { describe, expect, it, vi } from 'vitest';
import { ChangeProjectStatusUseCase } from './change-project-status.use-case';
import { Project } from '../../domain/entities/project.entity';
import {
  ActiveSupportContractMustBeClosedError,
  CannotActivateProjectError,
  ManualHito0ReasonRequiredError,
  SupportContractRequiredForStatusError,
} from '../../domain/errors/project.errors';
import type { SupportContractStatusReader } from '../ports/support-contract-status-reader.port';
import type { SupportPlanStatus, ProjectStatus } from '@kora/contracts';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import type { PaymentMilestoneTriggerService } from '../services/payment-milestone-trigger.service';
import { FixedClock } from '../../../../test/fakes';

const NOW = new Date('2026-09-24T00:00:00.000Z');
const ACTOR = { userId: 'leader-1', email: 'leader@kabeli.cl' };

function buildApprovedDraftProject() {
  return Project.create({
    id: 'project-1',
    name: 'Portal',
    slug: 'portal',
    type: 'development',
    salesStage: 'approved',
    status: 'draft',
    leaderUserId: 'leader-1',
    now: NOW,
  }).unwrap();
}

function buildUseCase(project: Project, contractStatuses: SupportPlanStatus[] = []) {
  const projects = {
    findById: vi.fn().mockResolvedValue(project),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectRepository;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const changeLog = { record: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectChangeLogRecorder;

  const paymentTriggers = { promoteAndNotify: vi.fn().mockResolvedValue(undefined) } as unknown as PaymentMilestoneTriggerService;
  const supportContracts = {
    statusesForProject: vi.fn().mockResolvedValue(contractStatuses),
  } as unknown as SupportContractStatusReader;

  const useCase = new ChangeProjectStatusUseCase(projects, audit, changeLog, new FixedClock(NOW), paymentTriggers, supportContracts);
  return { useCase, projects, changeLog, paymentTriggers, supportContracts };
}

function buildSupportProject(status: ProjectStatus = 'on_hold') {
  return Project.create({
    id: 'support-1', name: 'Soporte CPT', slug: 'soporte-cpt', type: 'support', status, now: NOW,
  }).unwrap();
}

describe('ChangeProjectStatusUseCase — Hito 0 manual', () => {
  it('rechaza activar manualmente sin projects:manage, aunque sea el líder del proyecto', async () => {
    const { useCase, projects } = buildUseCase(buildApprovedDraftProject());

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { status: 'active' },
      actor: ACTOR,
      actorPermissions: ['projects:read_assigned'],
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(CannotActivateProjectError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('rechaza activar manualmente sin motivo, aunque tenga projects:manage', async () => {
    const { useCase, projects } = buildUseCase(buildApprovedDraftProject());

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { status: 'active' },
      actor: ACTOR,
      actorPermissions: ['projects:manage'],
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(ManualHito0ReasonRequiredError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('activa manualmente con projects:manage y motivo, registrando Hito 0 origen "manual" y el motivo en la bitácora', async () => {
    const { useCase, projects, changeLog } = buildUseCase(buildApprovedDraftProject());

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { status: 'active', reason: 'Contrato firmado, orden de compra N°123.' },
      actor: ACTOR,
      actorPermissions: ['projects:manage'],
    });

    expect(result.isOk()).toBe(true);
    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.status).toBe('active');
    expect(saved.hito0Source).toBe('manual');
    expect(saved.hito0Reason).toBe('Contrato firmado, orden de compra N°123.');
    expect(changeLog.record).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          projectId: 'project-1',
          message: expect.stringContaining('Motivo: Contrato firmado, orden de compra N°123.'),
          isHito0: true,
        }),
      ],
      ACTOR.userId,
      NOW,
    );
  });

  it('rechaza reactivar un proyecto Detenido sin projects:manage, aunque sea el líder del proyecto', async () => {
    const project = Project.create({
      id: 'project-1',
      name: 'Portal',
      slug: 'portal',
      type: 'development',
      salesStage: 'approved',
      status: 'on_hold',
      leaderUserId: 'leader-1',
      now: NOW,
    }).unwrap();
    const { useCase, projects } = buildUseCase(project);

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { status: 'active' },
      actor: ACTOR,
      actorPermissions: ['projects:read_assigned'],
    });

    expect(result.isErr() && result.error).toBeInstanceOf(CannotActivateProjectError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('no exige motivo para otras transiciones (ej. pausar a Detenido)', async () => {
    const { useCase, projects } = buildUseCase(buildApprovedDraftProject());

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { status: 'on_hold' },
      actor: ACTOR,
      actorPermissions: ['projects:read_assigned'],
    });

    expect(result.isOk()).toBe(true);
    expect(projects.save).toHaveBeenCalledTimes(1);
  });

  it('al cambiar el estado evalúa los tramos de cobro (finalizar cumple los tramos por fase)', async () => {
    const { useCase, paymentTriggers } = buildUseCase(buildApprovedDraftProject());

    await useCase.execute({
      projectId: 'project-1',
      data: { status: 'finished' },
      actor: ACTOR,
      actorPermissions: ['projects:manage'],
    });

    expect(paymentTriggers.promoteAndNotify).toHaveBeenCalledWith(expect.objectContaining({ status: 'finished' }));
  });
});

describe('ChangeProjectStatusUseCase — contratos de soporte', () => {
  const command = (status: ProjectStatus) => ({
    projectId: 'support-1', data: { status }, actor: ACTOR, actorPermissions: ['projects:manage'] as const,
  });

  it('impide marcar Terminado mientras el contrato sigue activo', async () => {
    const { useCase, projects } = buildUseCase(buildSupportProject(), ['active']);
    const result = await useCase.execute(command('finished'));
    expect(result.isErr() && result.error).toBeInstanceOf(ActiveSupportContractMustBeClosedError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('permite corregir a Terminado si el contrato ya se cerró', async () => {
    const { useCase, projects } = buildUseCase(buildSupportProject(), ['ended']);
    const result = await useCase.execute(command('finished'));
    expect(result.isOk()).toBe(true);
    expect((projects.save as ReturnType<typeof vi.fn>).mock.calls[0]?.[0].status).toBe('finished');
  });

  it('no termina un soporte sin contrato cerrado ni reactiva uno sin contrato activo', async () => {
    const { useCase, projects } = buildUseCase(buildSupportProject(), []);
    const result = await useCase.execute(command('finished'));
    expect(result.isErr() && result.error).toBeInstanceOf(SupportContractRequiredForStatusError);
    const activation = await useCase.execute(command('active'));
    expect(activation.isErr() && activation.error).toBeInstanceOf(SupportContractRequiredForStatusError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('no reabre un soporte terminado mientras no tenga un contrato activo', async () => {
    const { useCase, projects } = buildUseCase(buildSupportProject('finished'), ['ended']);
    const result = await useCase.execute(command('on_hold'));
    expect(result.isErr() && result.error).toBeInstanceOf(SupportContractRequiredForStatusError);
    expect(projects.save).not.toHaveBeenCalled();
  });
});
