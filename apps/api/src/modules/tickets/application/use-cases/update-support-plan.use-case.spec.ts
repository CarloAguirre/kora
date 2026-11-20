import { describe, expect, it, vi } from 'vitest';
import { updateSupportPlanSchema } from '@kora/contracts';
import { UpdateSupportPlanUseCase } from './update-support-plan.use-case';
import { Project } from '../../../projects/domain/entities/project.entity';
import type { ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import { SupportPlan } from '../../domain/entities/support-plan.entity';
import type { SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { TicketClientReader } from '../ports/ticket-client-reader.port';
import type { TicketProjectReader } from '../ports/ticket-project-reader.port';
import { FixedClock, PassthroughUnitOfWork, RecordingAuditRecorder } from '../../../../test/fakes';

const NOW = new Date('2026-10-26T12:00:00.000Z');
const ACTOR = { userId: 'u1', email: 'a@kabeli.cl' } as never;

function buildUseCase() {
  const container = Project.create({
    id: 'project-1',
    name: 'Soporte PUCV',
    slug: 'soporte-pucv',
    type: 'support',
    soldHours: 179,
    supportHours: 179,
    now: NOW,
  }).unwrap();
  const plan = SupportPlan.create({
    id: 'plan-1',
    clientId: 'client-1',
    slug: 'soporte-pucv',
    projectId: container.id,
    scope: 'single',
    planType: 'bundle',
    startDate: new Date('2026-08-20'),
    contractedHours: 179,
    planValueUf: 133.5,
    extraHourValueUf: 0.9,
    now: NOW,
  }).unwrap();

  const plans = { findById: vi.fn().mockResolvedValue(plan), save: vi.fn().mockResolvedValue(undefined) };
  const projectRepository = {
    findById: vi.fn().mockResolvedValue(container),
    nameIsTakenByAnother: vi.fn().mockResolvedValue(false),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const useCase = new UpdateSupportPlanUseCase(
    plans as unknown as SupportPlanRepository,
    projectRepository as unknown as ProjectRepository,
    {} as TicketClientReader,
    {} as TicketProjectReader,
    new RecordingAuditRecorder(),
    new PassthroughUnitOfWork(),
    new FixedClock(NOW),
  );
  return { useCase, plan, container };
}

describe('UpdateSupportPlanUseCase', () => {
  it('al cambiar las HH del plan, el proyecto contenedor queda con las mismas HH vendidas y de soporte', async () => {
    const { useCase, plan, container } = buildUseCase();

    const result = await useCase.execute({ planId: plan.id, data: updateSupportPlanSchema.parse({ contractedHours: 157 }), actor: ACTOR });

    expect(result.isOk()).toBe(true);
    expect(plan.contractedHours).toBe(157);
    expect(container.toSnapshot()).toMatchObject({ soldHours: 157, supportHours: 157 });
  });

  it('editar otro dato del contrato no toca sus HH ni sus valores', async () => {
    const { useCase, plan, container } = buildUseCase();

    // Con Zod 4, `.partial()` aplicaba los `.default(0)` de crear a lo omitido y dejaba el plan en 0.
    await useCase.execute({ planId: plan.id, data: updateSupportPlanSchema.parse({ name: 'Soporte PUCV 2026' }), actor: ACTOR });

    expect(plan.toSnapshot()).toMatchObject({ contractedHours: 179, planValueUf: 133.5, extraHourValueUf: 0.9, currency: 'UF' });
    expect(container.toSnapshot()).toMatchObject({ soldHours: 179, supportHours: 179 });
  });
});
