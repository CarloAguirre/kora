import { describe, expect, it, vi } from 'vitest';
import { ChangeProjectStatusUseCase } from './change-project-status.use-case';
import { Project } from '../../domain/entities/project.entity';
import { CannotManuallyActivateProjectError, ManualHito0ReasonRequiredError } from '../../domain/errors/project.errors';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
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

function buildUseCase(project: Project) {
  const projects = {
    findById: vi.fn().mockResolvedValue(project),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectRepository;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const changeLog = { record: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectChangeLogRecorder;

  const useCase = new ChangeProjectStatusUseCase(projects, audit, changeLog, new FixedClock(NOW));
  return { useCase, projects };
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
    expect(result.isErr() && result.error).toBeInstanceOf(CannotManuallyActivateProjectError);
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

  it('activa manualmente con projects:manage y motivo, registrando Hito 0 origen "manual"', async () => {
    const { useCase, projects } = buildUseCase(buildApprovedDraftProject());

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
});
