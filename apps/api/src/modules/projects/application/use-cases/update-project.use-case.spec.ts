import { describe, expect, it, vi } from 'vitest';
import { UpdateProjectUseCase } from './update-project.use-case';
import { Project } from '../../domain/entities/project.entity';
import { CannotReassignProjectLeaderError, SoldHoursLockedAfterHito0Error } from '../../domain/errors/project.errors';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type { ProjectClientReader } from '../ports/project-client-reader.port';
import type { ProjectUserReader } from '../ports/project-user-reader.port';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import type { PaymentMilestoneTriggerService } from '../services/payment-milestone-trigger.service';
import type { ProjectPaymentMilestoneRepository } from '../../domain/repositories/project-payment-milestone.repository';
import { FixedClock } from '../../../../test/fakes';
import type { UnitOfWork } from '@kora/core';

const NOW = new Date('2026-09-24T00:00:00.000Z');

function buildProject(leaderUserId: string | null) {
  return Project.create({
    id: 'project-1',
    name: 'Proyecto de prueba',
    slug: 'proyecto-de-prueba',
    type: 'development',
    salesStage: 'approved',
    leaderUserId,
    now: NOW,
  }).unwrap();
}

function buildUseCase(leaderUserId: string | null, project: Project = buildProject(leaderUserId)) {
  const projects = {
    findById: vi.fn().mockResolvedValue(project),
    nameIsTakenByAnother: vi.fn().mockResolvedValue(false),
    save: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectRepository;
  const projectTeams = { findByProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamRepository;
  const clients = {} as ProjectClientReader;
  const users = { findManyByIds: vi.fn().mockResolvedValue([]) } as unknown as ProjectUserReader;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const changeLog = { record: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectChangeLogRecorder;
  const unitOfWork = { run: vi.fn((work: (tx: unknown) => Promise<unknown>) => work({})) } as unknown as UnitOfWork;
  const paymentMilestones = {} as ProjectPaymentMilestoneRepository;
  const paymentTriggers = {
    readinessOf: vi.fn().mockReturnValue(() => false),
    promote: vi.fn().mockResolvedValue([]),
    notify: vi.fn().mockResolvedValue(undefined),
  } as unknown as PaymentMilestoneTriggerService;

  const useCase = new UpdateProjectUseCase(
    projects,
    projectTeams,
    clients,
    users,
    audit,
    changeLog,
    unitOfWork,
    new FixedClock(NOW),
    paymentMilestones,
    paymentTriggers,
  );
  return { useCase, projects };
}

/**
 * Reasignar el líder de un proyecto a otra persona es decisión de Gerencia/PMO — sin este guardia,
 * el propio líder (con acceso de edición vía `project.leaderUserId === actor.userId`, sin
 * `projects:manage`) podía entregarle "su" proyecto a cualquiera. Ver `CannotReassignProjectLeaderError`.
 */
describe('UpdateProjectUseCase — reasignar líder', () => {
  it('rechaza que el propio líder (sin projects:manage) reasigne el proyecto a otra persona', async () => {
    const { useCase, projects } = buildUseCase('leader-1');

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { leaderUserId: 'other-user' },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:read_assigned'],
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() && result.error).toBeInstanceOf(CannotReassignProjectLeaderError);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('permite al líder (sin projects:manage) reenviar el mismo leaderUserId sin cambiarlo', async () => {
    const { useCase } = buildUseCase('leader-1');

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { leaderUserId: 'leader-1', name: 'Proyecto de prueba' },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:read_assigned'],
    });

    expect(result.isErr() && result.error).not.toBeInstanceOf(CannotReassignProjectLeaderError);
  });

  it('permite a un actor con projects:manage reasignar el líder', async () => {
    const { useCase, projects } = buildUseCase('leader-1');

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { leaderUserId: 'other-user' },
      actor: { userId: 'pmo-1', email: 'pmo@kabeli.cl' },
      actorPermissions: ['projects:manage'],
    });

    expect(result.isOk()).toBe(true);
    expect(projects.save).toHaveBeenCalledTimes(1);
  });
});

/** `primaryContactId` — contacto propio del proyecto, distinto del contacto del cliente. Antes solo se fijaba al crear un contrato de soporte; esto lo habilita para cualquier proyecto vía edición. */
describe('UpdateProjectUseCase — primaryContactId', () => {
  it('fija el contacto propio del proyecto', async () => {
    const { useCase, projects } = buildUseCase('leader-1');

    const result = await useCase.execute({
      projectId: 'project-1',
      data: { primaryContactId: 'contact-1' },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:read_assigned'],
    });

    expect(result.isOk()).toBe(true);
    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.toSnapshot().primaryContactId).toBe('contact-1');
  });

  it('limpia el contacto propio del proyecto cuando se envía null', async () => {
    const { useCase, projects } = buildUseCase('leader-1');

    await useCase.execute({
      projectId: 'project-1',
      data: { primaryContactId: null },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:read_assigned'],
    });

    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.toSnapshot().primaryContactId).toBeNull();
  });

  it('no toca el contacto si el campo no viene en la petición', async () => {
    const { useCase, projects } = buildUseCase('leader-1');

    await useCase.execute({
      projectId: 'project-1',
      data: { name: 'Otro nombre' },
      actor: { userId: 'leader-1', email: 'leader@kabeli.cl' },
      actorPermissions: ['projects:read_assigned'],
    });

    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.toSnapshot().primaryContactId).toBeNull();
  });
});

/** Desde el Hito 0 corren las horas vendidas: quedan fijas aunque el proyecto después se detenga o finalice. */
describe('UpdateProjectUseCase — HH vendidas tras el Hito 0', () => {
  const PMO = { actor: { userId: 'pmo-1', email: 'pmo@kabeli.cl' }, actorPermissions: ['projects:manage'] as const };

  function activatedProject() {
    const project = Project.create({
      id: 'project-1',
      name: 'Proyecto de prueba',
      slug: 'proyecto-de-prueba',
      type: 'development',
      salesStage: 'approved',
      soldHours: 1000,
      now: NOW,
    }).unwrap();
    project.activateFromHito0(NOW, 'manual', 'Contrato firmado');
    return project;
  }

  it('rechaza cambiar las HH vendidas de un proyecto con Hito 0', async () => {
    const { useCase, projects } = buildUseCase(null, activatedProject());

    const result = await useCase.execute({ projectId: 'project-1', data: { soldHours: 1200 }, ...PMO });

    expect(result.isErr() && result.error).toBeInstanceOf(SoldHoursLockedAfterHito0Error);
    expect(projects.save).not.toHaveBeenCalled();
  });

  it('permite reenviar las mismas HH vendidas sin cambiarlas', async () => {
    const { useCase } = buildUseCase(null, activatedProject());

    const result = await useCase.execute({ projectId: 'project-1', data: { soldHours: 1000, name: 'Otro nombre' }, ...PMO });

    expect(result.isOk()).toBe(true);
  });

  it('permite cambiar las HH vendidas antes del Hito 0', async () => {
    const { useCase, projects } = buildUseCase(null);

    const result = await useCase.execute({ projectId: 'project-1', data: { soldHours: 1200 }, ...PMO });

    expect(result.isOk()).toBe(true);
    const saved = (projects.save as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Project;
    expect(saved.toSnapshot().soldHours).toBe(1200);
  });
});
