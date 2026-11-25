import { describe, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectTeamMemberRepository } from '../../domain/repositories/project-team-member.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import type { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import { FixedClock, PassthroughUnitOfWork } from '../../../../test/fakes';
import { UnassignProjectTeamMemberUseCase } from './unassign-project-team-member.use-case';

function fixture() {
  const member = {
    id: 'assignment-1', projectId: 'project-1', teamId: 'team-1',
    teamMemberId: 'team-member-1', userId: 'collaborator-1',
    fullName: 'Colaborador Uno', consumedHours: 39, blockedAt: null,
  };
  const tasks = [
    { id: 'todo-1', teamId: 'team-1', assigneeUserId: member.userId,
      status: 'todo', segmentId: 'segment-1', cancelledAt: null },
    { id: 'progress-1', teamId: 'team-1', assigneeUserId: member.userId,
      status: 'in_progress', segmentId: null, cancelledAt: null },
    { id: 'approved-1', teamId: 'team-1', assigneeUserId: member.userId,
      status: 'done', segmentId: 'segment-1', cancelledAt: null },
    { id: 'other-1', teamId: 'team-1', assigneeUserId: 'other-user',
      status: 'todo', segmentId: null, cancelledAt: null },
  ];
  const members = {
    findById: vi.fn().mockResolvedValue(member),
    block: vi.fn().mockResolvedValue(undefined),
    unassign: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectTeamMemberRepository;
  const modules = {
    listForProject: vi.fn().mockResolvedValue([{ id: 'module-1', tasks }]),
    updateTask: vi.fn().mockResolvedValue(undefined),
    refreshSegmentClosure: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectModuleRepository;
  const forecast = { syncTask: vi.fn().mockResolvedValue(undefined) } as unknown as ForecastSourceSyncService;
  const progress = { recalculate: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectProgressRecalculator;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const useCase = new UnassignProjectTeamMemberUseCase(
    { findById: vi.fn().mockResolvedValue({ id: 'project-1', isDeleted: false,
      leaderUserId: 'leader-1' }) } as unknown as ProjectRepository,
    members,
    { isTeamLeaderForProject: vi.fn().mockResolvedValue(true) } as unknown as ProjectTeamRepository,
    audit,
    modules, progress, forecast, new FixedClock(), new PassthroughUnitOfWork(),
  );
  return { useCase, members, modules, forecast, progress, audit };
}

describe('Bloquear colaborador sin perder horas históricas', () => {
  it('libera solo tareas abiertas, conserva aprobadas y actúa atómicamente', async () => {
    const fx = fixture();
    const result = await fx.useCase.execute({
      projectId: 'project-1', assignmentId: 'assignment-1',
      actor: { userId: 'leader-1', email: 'leader@example.com' },
      actorPermissions: ['hours:register'],
    });
    expect(result.isOk()).toBe(true);
    expect(fx.members.block).toHaveBeenCalledWith('assignment-1', expect.any(Date), expect.anything());
    expect(fx.members.unassign).not.toHaveBeenCalled();
    expect(fx.modules.updateTask).toHaveBeenCalledTimes(2);
    expect(fx.modules.updateTask).toHaveBeenCalledWith('todo-1',
      expect.objectContaining({ assigneeUserId: null, status: 'todo' }), expect.any(Date), expect.anything());
    expect(fx.modules.updateTask).toHaveBeenCalledWith('progress-1',
      expect.objectContaining({ assigneeUserId: null, status: 'todo' }), expect.any(Date), expect.anything());
    expect(fx.forecast.syncTask).toHaveBeenCalledTimes(2);
    expect(fx.progress.recalculate).toHaveBeenCalledOnce();
    expect(fx.audit.record).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ event: 'member_blocked', releasedTasks: 2,
        preservedHours: 39 }),
    }));
  });
});
