import { describe, expect, it, vi } from 'vitest';
import { UpdateProjectUseCase } from './update-project.use-case';
import { Project } from '../../domain/entities/project.entity';
import { CannotReassignProjectLeaderError } from '../../domain/errors/project.errors';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type { ProjectClientReader } from '../ports/project-client-reader.port';
import type { ProjectUserReader } from '../ports/project-user-reader.port';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
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

function buildUseCase(leaderUserId: string | null) {
  const project = buildProject(leaderUserId);
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

  const useCase = new UpdateProjectUseCase(
    projects,
    projectTeams,
    clients,
    users,
    audit,
    changeLog,
    unitOfWork,
    new FixedClock(NOW),
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
