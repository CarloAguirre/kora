import { describe, expect, it, vi } from 'vitest';
import { GetProjectUseCase } from './get-project.use-case';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectTeamMemberRepository } from '../../domain/repositories/project-team-member.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type { ProjectObservationRepository } from '../../domain/repositories/project-observation.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ProjectPaymentMilestoneRepository } from '../../domain/repositories/project-payment-milestone.repository';
import type { ProjectUserReader } from '../ports/project-user-reader.port';
import type { ProjectClientReader } from '../ports/project-client-reader.port';
import type { ProjectContactReader } from '../ports/project-contact-reader.port';
import type { ProjectHourEntryReader } from '../ports/project-hour-entry-reader.port';
import type { ProjectActivityReader } from '../ports/project-activity-reader.port';
import type { PaymentMilestoneTriggerService } from '../services/payment-milestone-trigger.service';
import { FixedClock } from '../../../../test/fakes';

class FakeProjectRepository implements Partial<ProjectRepository> {
  findById = vi.fn().mockResolvedValue(null);
  findBySlug = vi.fn().mockResolvedValue(null);
}

const NEVER_USED = {} as never;

function buildUseCase(projects: FakeProjectRepository) {
  return new GetProjectUseCase(
    projects as unknown as ProjectRepository,
    NEVER_USED as ProjectTeamMemberRepository,
    NEVER_USED as ProjectTeamRepository,
    NEVER_USED as ProjectObservationRepository,
    NEVER_USED as ProjectModuleRepository,
    NEVER_USED as ProjectPaymentMilestoneRepository,
    NEVER_USED as ProjectUserReader,
    NEVER_USED as ProjectClientReader,
    NEVER_USED as ProjectContactReader,
    NEVER_USED as ProjectHourEntryReader,
    NEVER_USED as ProjectActivityReader,
    new FixedClock(),
    NEVER_USED as PaymentMilestoneTriggerService,
    NEVER_USED,
  );
}

/**
 * `GET /projects/:id` acepta UUID o slug. Fija qué método del repositorio se
 * llama según la forma del valor — sin esto, un test que solo mirara "hay
 * error NotFound" hubiera seguido pasando aunque la resolución por slug se
 * rompiera por completo.
 */
describe('GetProjectUseCase — resolución por id o slug', () => {
  it('con un UUID, busca por id y no por slug', async () => {
    const projects = new FakeProjectRepository();
    const useCase = buildUseCase(projects);

    await useCase.execute({ projectId: '11111111-1111-4111-8111-111111111111', actorUserId: 'u1', actorPermissions: ['projects:read'] });

    expect(projects.findById).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(projects.findBySlug).not.toHaveBeenCalled();
  });

  it('con un slug, busca por slug y no por id', async () => {
    const projects = new FakeProjectRepository();
    const useCase = buildUseCase(projects);

    await useCase.execute({ projectId: 'rediseno-web', actorUserId: 'u1', actorPermissions: ['projects:read'] });

    expect(projects.findBySlug).toHaveBeenCalledWith('rediseno-web');
    expect(projects.findById).not.toHaveBeenCalled();
  });
});


/**
 * Regresión: la estimación ya asignó el equipo a project_teams pero no tiene
 * líder específico. El repositorio resuelve su líder orgánico y el endpoint
 * debe autorizarlo sin agregarlo como colaborador.
 */
describe('GetProjectUseCase — lectura del líder de un equipo aprobado', () => {
  it('autoriza al líder efectivo incluso sin colaboradores asignados al proyecto', async () => {
    const actorUserId = 'leader-team-1';
    const project = {
      id: '11111111-1111-4111-8111-111111111111',
      isDeleted: false,
      pendingManagementApproval: null,
      toSnapshot: () => ({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Proyecto traspasado',
        slug: 'proyecto-traspasado',
        type: 'development',
        status: 'draft',
        salesStage: 'approved',
        phase: 'development',
        soldHours: 100,
        usedHours: 0,
        leaderUserId: 'project-pm',
        developerUserId: null,
        commercialManagerUserId: null,
        primaryContactId: null,
        clientId: null,
        hito0At: null,
        createdAt: new Date('2026-11-01T12:00:00.000Z'),
        updatedAt: new Date('2026-11-01T12:00:00.000Z'),
      }),
    };
    const projects = {
      findById: vi.fn().mockResolvedValue(project),
      isProjectLeaderOrTeamLeaderOfMember: vi.fn().mockResolvedValue(true),
    };
    const u = new GetProjectUseCase(
      projects as unknown as ProjectRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamMemberRepository,
      { findByProject: vi.fn().mockResolvedValue([{
        id: 'link-1', teamId: 'team-1', teamName: 'Desarrollo',
        teamSlug: 'desarrollo',
        leaderUserId: actorUserId, leaderName: 'Líder orgánico',
        assignedHours: 100, memberCount: 0, maxMembers: 2,
      }]) } as unknown as ProjectTeamRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectObservationRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectModuleRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectPaymentMilestoneRepository,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectUserReader,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectClientReader,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectContactReader,
      {
        maxApprovedEntryDateForProject: vi.fn().mockResolvedValue(null),
        sumApprovedHoursBeforeDateForProject: vi.fn().mockResolvedValue(0),
      } as unknown as ProjectHourEntryReader,
      { lastActivityAtByUser: vi.fn().mockResolvedValue(null) } as unknown as ProjectActivityReader,
      new FixedClock(),
      { promoteAndNotify: vi.fn().mockResolvedValue(undefined) } as unknown as PaymentMilestoneTriggerService,
      { ensure: vi.fn().mockResolvedValue(false) },
    );
    const result = await u.execute({
      projectId: project.id, actorUserId, actorPermissions: ['projects:read_assigned'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.teams[0]?.leader?.id).toBe(actorUserId);
  });
});

describe('GetProjectUseCase — calendario traspasado al iniciar', () => {
  it('activa la materialización aun si la etapa comercial cambió después del traspaso', async () => {
    const projectId = '11111111-1111-4111-8111-111111111121';
    const project = {
      id: projectId,
      isDeleted: false,
      pendingManagementApproval: null,
      toSnapshot: () => ({
        id: projectId,
        name: 'Proyecto aprobado y traspasado',
        slug: 'proyecto-aprobado',
        type: 'development',
        status: 'active',
        // El evento quotation_transferred del calendario, y no esta columna
        // editable, es lo que acredita el traspaso.
        salesStage: 'quoted',
        phase: 'development',
        soldHours: 200,
        usedHours: 0,
        leaderUserId: 'project-pm',
        developerUserId: null,
        commercialManagerUserId: null,
        primaryContactId: null,
        clientId: null,
        hito0At: new Date('2026-11-04T12:00:00.000Z'),
        startDate: '2026-11-05',
        createdAt: new Date('2026-11-01T12:00:00.000Z'),
        updatedAt: new Date('2026-11-04T12:00:00.000Z'),
      }),
    };
    const ensure = vi.fn().mockResolvedValue(true);
    const modules = { listForProject: vi.fn().mockResolvedValue([]) };
    const useCase = new GetProjectUseCase(
      { findById: vi.fn().mockResolvedValue(project),
        isProjectLeaderOrTeamLeaderOfMember: vi.fn().mockResolvedValue(false),
      } as unknown as ProjectRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamMemberRepository,
      { findByProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectObservationRepository,
      modules as unknown as ProjectModuleRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectPaymentMilestoneRepository,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectUserReader,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectClientReader,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectContactReader,
      { maxApprovedEntryDateForProject: vi.fn().mockResolvedValue(null),
        sumApprovedHoursBeforeDateForProject: vi.fn().mockResolvedValue(0),
      } as unknown as ProjectHourEntryReader,
      { lastActivityAtByUser: vi.fn().mockResolvedValue(null) } as unknown as ProjectActivityReader,
      new FixedClock(),
      { promoteAndNotify: vi.fn().mockResolvedValue(undefined) } as unknown as PaymentMilestoneTriggerService,
      { ensure },
    );
    const result = await useCase.execute({
      projectId, actorUserId: 'project-pm', actorPermissions: ['projects:read'],
    });
    expect(result.isOk()).toBe(true);
    expect(ensure).toHaveBeenCalledOnce();
    expect(ensure).toHaveBeenCalledWith(projectId);
    // El GET devuelve el calendario ya materializado y no el snapshot obsoleto.
    expect(modules.listForProject).toHaveBeenCalledTimes(2);
  });
});
