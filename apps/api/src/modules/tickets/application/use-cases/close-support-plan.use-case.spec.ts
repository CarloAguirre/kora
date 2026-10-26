import { describe, expect, it, vi } from 'vitest';
import { ok, type TransactionContext, type UnitOfWork } from '@kora/core';
import type { Project } from '../../../projects/domain/entities/project.entity';
import type { ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import type { SupportPlan } from '../../domain/entities/support-plan.entity';
import type { SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { FixedClock } from '../../../../test/fakes';
import { CloseSupportPlanUseCase } from './close-support-plan.use-case';

const NOW = new Date('2026-10-26T12:00:00Z');
const TX = { _brand: 'TransactionContext' } as TransactionContext;

function setup(otherActivePlan: boolean) {
  const plan = {
    id: 'plan-1', projectId: 'project-1', close: vi.fn().mockReturnValue(ok(undefined)),
  } as unknown as SupportPlan;
  const project = {
    isDeleted: false, type: 'support', status: 'on_hold',
    changeStatus: vi.fn(function (this: { status: string }, status: string) { this.status = status; }),
  } as unknown as Project;
  const plans = {
    findById: vi.fn().mockResolvedValue(plan),
    save: vi.fn().mockResolvedValue(undefined),
    findActiveForProjectOrLinked: vi.fn().mockResolvedValue(otherActivePlan ? { id: 'plan-2' } : null),
  } as unknown as SupportPlanRepository;
  const projects = {
    findById: vi.fn().mockResolvedValue(project),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectRepository;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const unitOfWork = { run: vi.fn().mockImplementation((work: (tx: TransactionContext) => Promise<unknown>) => work(TX)) } as unknown as UnitOfWork;
  const useCase = new CloseSupportPlanUseCase(plans, projects, audit, new FixedClock(NOW), unitOfWork);
  return { useCase, plan, project, plans, projects, audit, unitOfWork };
}

describe('CloseSupportPlanUseCase', () => {
  const command = {
    planId: 'plan-1', data: { closedAt: '2026-10-26', closeReason: 'No renovado' },
    actor: { userId: 'admin-1', email: 'admin@kabeli.cl' },
  };

  it('cierra el contrato y termina el proyecto en la misma transacción', async () => {
    const { useCase, plan, project, plans, projects, unitOfWork } = setup(false);
    expect((await useCase.execute(command)).isOk()).toBe(true);
    expect(unitOfWork.run).toHaveBeenCalledTimes(1);
    expect(plans.save).toHaveBeenCalledWith(plan, TX);
    expect(plans.findActiveForProjectOrLinked).toHaveBeenCalledWith('project-1', TX);
    expect(projects.findById).toHaveBeenCalledWith('project-1', TX);
    expect(projects.save).toHaveBeenCalledWith(project, TX);
    expect(project.status).toBe('finished');
  });

  it('conserva el estado del proyecto si aún queda otro contrato activo', async () => {
    const { useCase, project, projects } = setup(true);
    expect((await useCase.execute(command)).isOk()).toBe(true);
    expect(project.status).toBe('on_hold');
    expect(projects.save).not.toHaveBeenCalled();
  });
});
