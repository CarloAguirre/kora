import { describe, expect, it } from 'vitest';
import type { Page } from '@kora/core';
import type { HourEntryListItem, HourEntryRepository } from '../../domain/repositories/hour-entry.repository';
import type {
  HourEntryProjectApprover,
  HourEntryProjectReader,
  HourEntryProjectReference,
} from '../ports/hour-entry-project-reader.port';
import { GetProjectPendingApprovalsUseCase } from './get-project-pending-approvals.use-case';

function buildItem(overrides: Partial<HourEntryListItem>): HourEntryListItem {
  return {
    id: overrides.id ?? 'entry-1',
    userId: overrides.userId ?? 'owner-1',
    userFullName: overrides.userFullName ?? 'Persona',
    projectId: 'project-1',
    projectName: 'Proyecto',
    moduleId: null,
    moduleName: null,
    teamId: null,
    teamName: null,
    assignment: 'Proyecto',
    category: '',
    description: '',
    hours: overrides.hours ?? 4,
    date: overrides.date ?? new Date('2026-08-20'),
    isOvertime: false,
    projectStageAtEntry: null,
    status: 'pending',
    rejectionReason: null,
    hasBlocker: false,
    blockerDescription: null,
    designatedApproverUserId: null,
    designatedApproverFullName: null,
    projectApprovers: [],
    ticket: null,
    createdAt: new Date('2026-08-20'),
    decisionUserId: null,
    decisionByFullName: null,
    clientId: null,
    clientName: null,
    projectType: null,
    projectSalesStage: null,
    ...overrides,
  };
}

class FakeEntryRepository implements HourEntryRepository {
  constructor(private readonly items: HourEntryListItem[]) {}
  async findById(): Promise<null> {
    return null;
  }
  async findByLegacyId(): Promise<null> {
    return null;
  }
  async search(): Promise<Page<HourEntryListItem>> {
    return { items: this.items, total: this.items.length, page: 1, pageSize: this.items.length, pageCount: 1 };
  }
  async save(): Promise<void> {}
  async delete(): Promise<void> {}
  async sumApprovedHoursForProject(): Promise<number> {
    return 0;
  }
  async sumApprovedHoursForProjects(): Promise<number> {
    return 0;
  }
  async sumRegularHoursForUserAndDate(): Promise<number> {
    return 0;
  }
  async sumOvertimeHoursByUserForProjects(): Promise<never[]> {
    return [];
  }
  async sumOvertimeHoursByProjectAndUser(): Promise<never[]> {
    return [];
  }
}

class FakeProjectReader implements HourEntryProjectReader {
  constructor(
    private readonly project: HourEntryProjectReference | null,
    /** aprobador exclusivo por dueño (ver `DrizzleProjectRepository.findApproverCandidatesForMember`) */
    private readonly approversByOwner: Record<string, HourEntryProjectApprover[]>,
  ) {}
  async findById(): Promise<HourEntryProjectReference | null> {
    return this.project;
  }
  async findManyByIds(): Promise<HourEntryProjectReference[]> {
    return this.project ? [this.project] : [];
  }
  async findModuleById(): Promise<null> {
    return null;
  }
  async recalculateUsedHours(): Promise<void> {}
  async isProjectApprover(): Promise<boolean> {
    return false;
  }
  async findApprovers(_projectId: string, memberUserId: string): Promise<HourEntryProjectApprover[]> {
    return this.approversByOwner[memberUserId] ?? [];
  }
}

const PROJECT_LEADER = { id: 'project-leader-1', fullName: 'Líder de Proyecto' };
const TEAM_LEADER_A = { id: 'team-leader-a', fullName: 'Líder Equipo A' };
const TEAM_LEADER_B = { id: 'team-leader-b', fullName: 'Líder Equipo B' };

describe('GetProjectPendingApprovalsUseCase', () => {
  it('rechaza a quien no es líder de este proyecto (ni admin/pmo)', async () => {
    const useCase = new GetProjectPendingApprovalsUseCase(
      new FakeEntryRepository([]),
      new FakeProjectReader({ id: 'project-1', name: 'Proyecto', status: 'active', leaderUserId: PROJECT_LEADER.id, allowsOvertime: false }, {}),
    );

    const result = await useCase.execute({
      projectId: 'project-1',
      actor: { userId: 'someone-else', email: 'x@kabeli.cl' },
      actorRole: 'leader',
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.code).toBe('PROJECT_PENDING_APPROVALS_FORBIDDEN');
  });

  it('deja ver el resumen al propio líder del proyecto', async () => {
    const useCase = new GetProjectPendingApprovalsUseCase(
      new FakeEntryRepository([]),
      new FakeProjectReader({ id: 'project-1', name: 'Proyecto', status: 'active', leaderUserId: PROJECT_LEADER.id, allowsOvertime: false }, {}),
    );

    const result = await useCase.execute({
      projectId: 'project-1',
      actor: { userId: PROJECT_LEADER.id, email: 'x@kabeli.cl' },
      actorRole: 'leader',
    });

    expect(result.isOk()).toBe(true);
  });

  it('deja ver el resumen a admin/pmo aunque no lideren el proyecto', async () => {
    const useCase = new GetProjectPendingApprovalsUseCase(
      new FakeEntryRepository([]),
      new FakeProjectReader({ id: 'project-1', name: 'Proyecto', status: 'active', leaderUserId: PROJECT_LEADER.id, allowsOvertime: false }, {}),
    );

    const result = await useCase.execute({
      projectId: 'project-1',
      actor: { userId: 'admin-1', email: 'x@kabeli.cl' },
      actorRole: 'admin',
    });

    expect(result.isOk()).toBe(true);
  });

  it('agrupa lo pendiente por líder de equipo y EXCLUYE lo que está pendiente directamente con el líder de proyecto', async () => {
    const items = [
      buildItem({ id: 'e1', userId: 'owner-a1', hours: 3, date: new Date('2026-08-10') }),
      buildItem({ id: 'e2', userId: 'owner-a1', hours: 5, date: new Date('2026-08-05') }),
      buildItem({ id: 'e3', userId: 'owner-b1', hours: 2, date: new Date('2026-08-12') }),
      // owner-c1 no tiene líder de equipo: su aprobador resuelto es el propio
      // líder de proyecto — no debe aparecer en el resumen.
      buildItem({ id: 'e4', userId: 'owner-c1', hours: 8, date: new Date('2026-08-01') }),
    ];

    const useCase = new GetProjectPendingApprovalsUseCase(
      new FakeEntryRepository(items),
      new FakeProjectReader(
        { id: 'project-1', name: 'Proyecto', status: 'active', leaderUserId: PROJECT_LEADER.id, allowsOvertime: false },
        {
          'owner-a1': [TEAM_LEADER_A],
          'owner-b1': [TEAM_LEADER_B],
          'owner-c1': [PROJECT_LEADER],
        },
      ),
    );

    const result = await useCase.execute({
      projectId: 'project-1',
      actor: { userId: PROJECT_LEADER.id, email: 'x@kabeli.cl' },
      actorRole: 'leader',
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const groups = result.value.groups;
    expect(groups).toHaveLength(2);

    const groupA = groups.find((g) => g.approverUserId === TEAM_LEADER_A.id);
    expect(groupA).toEqual({
      approverUserId: TEAM_LEADER_A.id,
      approverName: TEAM_LEADER_A.fullName,
      entryCount: 2,
      totalHours: 8,
      oldestPendingDate: '2026-08-05',
      collaborators: [
        { userId: 'owner-a1', userName: 'Persona', entryCount: 2, totalHours: 8, oldestPendingDate: '2026-08-05' },
      ],
    });

    const groupB = groups.find((g) => g.approverUserId === TEAM_LEADER_B.id);
    expect(groupB).toEqual({
      approverUserId: TEAM_LEADER_B.id,
      approverName: TEAM_LEADER_B.fullName,
      entryCount: 1,
      totalHours: 2,
      oldestPendingDate: '2026-08-12',
      collaborators: [
        { userId: 'owner-b1', userName: 'Persona', entryCount: 1, totalHours: 2, oldestPendingDate: '2026-08-12' },
      ],
    });

    expect(groups.some((g) => g.approverUserId === PROJECT_LEADER.id)).toBe(false);
  });

  it('desglosa el total de un líder de equipo por cada colaborador que le reporta', async () => {
    const items = [
      buildItem({ id: 'e1', userId: 'owner-a1', userFullName: 'Ana', hours: 3, date: new Date('2026-08-10') }),
      buildItem({ id: 'e2', userId: 'owner-a2', userFullName: 'Beto', hours: 5, date: new Date('2026-08-02') }),
      buildItem({ id: 'e3', userId: 'owner-a2', userFullName: 'Beto', hours: 1, date: new Date('2026-08-06') }),
    ];

    const useCase = new GetProjectPendingApprovalsUseCase(
      new FakeEntryRepository(items),
      new FakeProjectReader(
        { id: 'project-1', name: 'Proyecto', status: 'active', leaderUserId: PROJECT_LEADER.id, allowsOvertime: false },
        { 'owner-a1': [TEAM_LEADER_A], 'owner-a2': [TEAM_LEADER_A] },
      ),
    );

    const result = await useCase.execute({
      projectId: 'project-1',
      actor: { userId: PROJECT_LEADER.id, email: 'x@kabeli.cl' },
      actorRole: 'leader',
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) return;

    const group = result.value.groups.find((g) => g.approverUserId === TEAM_LEADER_A.id);
    expect(group?.entryCount).toBe(3);
    expect(group?.totalHours).toBe(9);
    expect(group?.collaborators).toEqual([
      { userId: 'owner-a2', userName: 'Beto', entryCount: 2, totalHours: 6, oldestPendingDate: '2026-08-02' },
      { userId: 'owner-a1', userName: 'Ana', entryCount: 1, totalHours: 3, oldestPendingDate: '2026-08-10' },
    ]);
  });
});
