import { describe, expect, it, vi } from 'vitest';
import type { CreateSupportPlanInput } from '@kora/contracts';
import { CreateSupportPlanUseCase } from './create-support-plan.use-case';
import type { Project } from '../../../projects/domain/entities/project.entity';
import type { ProjectRepository } from '../../../projects/domain/repositories/project.repository';
import type { SupportPlan } from '../../domain/entities/support-plan.entity';
import type { SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import type { TicketClientReader } from '../ports/ticket-client-reader.port';
import type { TicketProjectReader, TicketProjectReference } from '../ports/ticket-project-reader.port';
import { FixedClock, PassthroughUnitOfWork, RecordingAuditRecorder, SequentialIdGenerator } from '../../../../test/fakes';

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const APP_2 = '00000000-0000-4000-8000-000000000002';
const APP_3 = '00000000-0000-4000-8000-000000000003';

function finished(id: string, name: string): TicketProjectReference {
  return { id, name, status: 'finished', type: 'development', clientId: CLIENT_ID };
}

function buildUseCase(options: { nameTaken?: boolean } = {}) {
  const savedProjects: Project[] = [];
  const savedPlans: SupportPlan[] = [];
  const plans = {
    findBySlug: vi.fn().mockResolvedValue(null),
    findProjectIdsAlreadyLinked: vi.fn().mockResolvedValue([]),
    save: vi.fn(async (plan: SupportPlan) => void savedPlans.push(plan)),
    linkProjects: vi.fn().mockResolvedValue(undefined),
    createInitialPeriod: vi.fn().mockResolvedValue(undefined),
  };
  const projectRepository = {
    nameIsTakenByAnother: vi.fn().mockResolvedValue(options.nameTaken ?? false),
    findBySlug: vi.fn().mockResolvedValue(null),
    save: vi.fn(async (project: Project) => void savedProjects.push(project)),
  };
  const clients = { findById: vi.fn().mockResolvedValue({ id: CLIENT_ID, companyName: 'Abarca Motores', primaryContact: null }) };
  const projects = { findManyByIds: vi.fn().mockResolvedValue([finished(APP_2, 'App 2'), finished(APP_3, 'App 3')]) };

  const useCase = new CreateSupportPlanUseCase(
    plans as unknown as SupportPlanRepository,
    projectRepository as unknown as ProjectRepository,
    clients as unknown as TicketClientReader,
    projects as unknown as TicketProjectReader,
    new RecordingAuditRecorder(),
    new PassthroughUnitOfWork(),
    new FixedClock(new Date('2026-10-08T12:00:00.000Z')),
    new SequentialIdGenerator(),
  );
  return { useCase, savedProjects, savedPlans, plans };
}

const INPUT = {
  clientId: CLIENT_ID,
  developmentProjectIds: [APP_2, APP_3],
  name: 'Soporte Abarca Motores',
  startDate: '2026-10-01',
  endDate: '2026-12-31',
  planType: 'monthly',
  surplusPolicy: 'expire',
  contractedHours: 50,
  planValueUf: 0,
  extraHourValueUf: 0.35,
  currency: 'UF',
} as CreateSupportPlanInput;

/**
 * Sin proyecto "contenedor" de soporte, el contrato quedaba fuera de todo lo
 * que lista proyectos de soporte — incluido el selector "Proyecto" del modal
 * de ticket, así que no había cómo abrirle un ticket.
 */
describe('CreateSupportPlanUseCase — proyecto contenedor de soporte', () => {
  it('crea un proyecto de soporte con los datos del contrato y lo enlaza como su project_id', async () => {
    const { useCase, savedProjects, savedPlans, plans } = buildUseCase();

    const result = await useCase.execute({ data: INPUT, actor: { userId: 'u1', email: 'a@kabeli.cl' } as never });

    expect(result.isOk()).toBe(true);
    expect(savedProjects).toHaveLength(1);
    const project = savedProjects[0]!.toSnapshot();
    expect(project).toMatchObject({ name: 'Soporte Abarca Motores', type: 'support', status: 'active', clientId: CLIENT_ID, soldHours: 50, supportHours: 50 });
    expect(savedPlans[0]!.projectId).toBe(project.id);
    expect(plans.linkProjects).toHaveBeenCalledWith(savedPlans[0]!.id, [APP_2, APP_3], expect.anything());
  });

  it('rechaza el contrato si su nombre ya lo usa otro proyecto del cliente', async () => {
    const { useCase, savedProjects, savedPlans } = buildUseCase({ nameTaken: true });

    const result = await useCase.execute({ data: INPUT, actor: { userId: 'u1', email: 'a@kabeli.cl' } as never });

    expect(result.isErr() && result.error.code).toBe('PROJECT_NAME_ALREADY_IN_USE');
    expect(savedProjects).toHaveLength(0);
    expect(savedPlans).toHaveLength(0);
  });
});
