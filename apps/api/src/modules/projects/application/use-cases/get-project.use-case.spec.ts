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
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
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
    NEVER_USED as ProjectProgressRecalculator,
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
        leaderUserId: null, leaderName: null,
        effectiveLeaderUserId: actorUserId,
        assignedHours: 100, memberCount: 0, maxMembers: 2,
        leaderConsumedHours: 0,
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
      { recalculate: vi.fn() } as unknown as ProjectProgressRecalculator,
    );
    const result = await u.execute({
      projectId: project.id, actorUserId, actorPermissions: ['projects:read_assigned'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.teams[0]?.leader).toBeNull(); // override explícito ausente
      expect(result.value.teams[0]?.isTeamLeader).toBe(true); // el líder orgánico sí puede gestionar
    }
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
        startDate: new Date('2026-11-05T00:00:00.000Z'),
        createdAt: new Date('2026-11-01T12:00:00.000Z'),
        updatedAt: new Date('2026-11-04T12:00:00.000Z'),
      }),
    };
    const ensure = vi.fn().mockResolvedValue(true);
    const recalculate = vi.fn().mockResolvedValue(undefined);
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
      { recalculate } as unknown as ProjectProgressRecalculator,
    );
    const result = await useCase.execute({
      projectId, actorUserId: 'project-pm', actorPermissions: ['projects:read'],
    });
    expect(result.isOk()).toBe(true);
    expect(ensure).toHaveBeenCalledOnce();
    expect(ensure).toHaveBeenCalledWith(projectId);
    expect(recalculate).toHaveBeenCalledOnce();
    expect(recalculate).toHaveBeenCalledWith(projectId);
    // El GET devuelve el calendario ya materializado y no el snapshot obsoleto.
    expect(modules.listForProject).toHaveBeenCalledTimes(2);
  });
});


/**
 * Regresión de App Walvy: un proyecto activo heredado puede tener fecha de
 * inicio y HH históricas, pero carecer de Hito 0. La fecha de inicio funciona
 * como corte temporal provisional sin escribir en la BD ni generar el hito.
 */
describe('GetProjectUseCase — corte provisional de HH', () => {
  const projectId = '11111111-1111-4111-8111-111111111141';

  function buildCutoffScenario({
    status = 'active',
    startDate = new Date('2026-03-30T00:00:00.000Z'),
    hito0At = null,
    hoursBeforeCutoff = 0,
  }: {
    status?: 'active' | 'draft';
    startDate?: Date | null;
    hito0At?: Date | null;
    hoursBeforeCutoff?: number;
  } = {}) {
    const snapshot = {
      id: projectId, name: 'App Walvy', slug: 'app-walvy',
      type: 'development', salesStage: 'approved', status,
      phase: 'development', soldHours: 2489, usedHours: 5143.75,
      leaderUserId: null, developerUserId: null,
      commercialManagerUserId: null, primaryContactId: null, clientId: null,
      startDate, hito0At,
      createdAt: new Date('2026-03-01T12:00:00.000Z'),
      updatedAt: new Date('2026-11-10T12:00:00.000Z'),
    };
    const projects = {
      findById: vi.fn().mockResolvedValue({
        id: projectId, isDeleted: false, pendingManagementApproval: false,
        toSnapshot: () => snapshot,
      }),
      isProjectLeaderOrTeamLeaderOfMember: vi.fn().mockResolvedValue(false),
    };
    const hourEntries = {
      maxApprovedEntryDateForProject: vi.fn().mockResolvedValue(null),
      sumApprovedHoursBeforeDateForProject: vi.fn().mockResolvedValue(hoursBeforeCutoff),
    };
    const ensure = vi.fn().mockResolvedValue(false);
    const useCase = new GetProjectUseCase(
      projects as unknown as ProjectRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamMemberRepository,
      { findByProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectObservationRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectModuleRepository,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectPaymentMilestoneRepository,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectUserReader,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectClientReader,
      { findById: vi.fn().mockResolvedValue(null) } as unknown as ProjectContactReader,
      hourEntries as unknown as ProjectHourEntryReader,
      { lastActivityAtByUser: vi.fn().mockResolvedValue(null) } as unknown as ProjectActivityReader,
      new FixedClock(),
      { promoteAndNotify: vi.fn().mockResolvedValue(undefined) } as unknown as PaymentMilestoneTriggerService,
      { ensure },
      { recalculate: vi.fn() } as unknown as ProjectProgressRecalculator,
    );
    return { useCase, hourEntries, ensure };
  }

  const read = (useCase: GetProjectUseCase) =>
    useCase.execute({ projectId, actorUserId: 'pmo-1', actorPermissions: ['projects:read'] });

  it('usa startDate para un proyecto activo sin Hito 0, conservando las HH históricas', async () => {
    const { useCase, hourEntries } = buildCutoffScenario();
    const result = await read(useCase);
    expect(result.isOk()).toBe(true);
    expect(hourEntries.sumApprovedHoursBeforeDateForProject)
      .toHaveBeenCalledWith(projectId, new Date('2026-03-30T00:00:00.000Z'));
    if (result.isOk()) {
      expect(result.value.prospectPhaseHours).toBe(0);
      expect(result.value.usedHours).toBe(5143.75);
      expect(result.value.hito0At).toBeNull();
      expect(result.value.startDate).toBe('2026-03-30');
    }
  });

  it('prioriza siempre el Hito 0 registrado frente a startDate', async () => {
    const { useCase, hourEntries } = buildCutoffScenario({
      hito0At: new Date('2026-06-01T15:30:00.000Z'), hoursBeforeCutoff: 1244.2,
    });
    const result = await read(useCase);
    expect(hourEntries.sumApprovedHoursBeforeDateForProject)
      .toHaveBeenCalledWith(projectId, new Date('2026-06-01T00:00:00.000Z'));
    if (result.isOk()) expect(result.value.prospectPhaseHours).toBe(1244.2);
    else throw new Error('La lectura del proyecto falló');
  });

  it('sin Hito 0 ni fecha inicial conserva todo el consumo como Prospecto/Cotización', async () => {
    const { useCase, hourEntries } = buildCutoffScenario({ startDate: null });
    const result = await read(useCase);
    expect(hourEntries.sumApprovedHoursBeforeDateForProject).not.toHaveBeenCalled();
    if (result.isOk()) expect(result.value.prospectPhaseHours).toBe(5143.75);
    else throw new Error('La lectura del proyecto falló');
  });

  it('no aplica el inicio planificado a un proyecto aún No iniciado', async () => {
    const { useCase, hourEntries } = buildCutoffScenario({ status: 'draft' });
    const result = await read(useCase);
    expect(hourEntries.sumApprovedHoursBeforeDateForProject).not.toHaveBeenCalled();
    if (result.isOk()) expect(result.value.prospectPhaseHours).toBe(5143.75);
    else throw new Error('La lectura del proyecto falló');
  });

  it('admite un inicio futuro como corte, sin crear Hito 0 y manteniendo las HH', async () => {
    const { useCase, hourEntries } = buildCutoffScenario({
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      hoursBeforeCutoff: 5143.75,
    });
    const result = await read(useCase);
    expect(hourEntries.sumApprovedHoursBeforeDateForProject)
      .toHaveBeenCalledWith(projectId, new Date('2026-12-01T00:00:00.000Z'));
    if (result.isOk()) {
      expect(result.value.prospectPhaseHours).toBe(5143.75);
      expect(result.value.usedHours).toBe(5143.75);
      expect(result.value.hito0At).toBeNull();
    } else throw new Error('La lectura del proyecto falló');
  });
});
