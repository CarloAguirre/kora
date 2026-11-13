import { describe, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ProjectTeamMemberRepository } from '../../domain/repositories/project-team-member.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import { ListProjectPhasesUseCase } from './list-project-phases.use-case';

const projectId = 'e96d8c62-179f-44a5-a333-f4bb5c7718be';
const memberId = '7cba24af-33a2-4b9c-968b-081748199bef';

describe('Fases para registrar horas · consumo progresivo por tarea', () => {
  const createCase = (taskHours: { estimatedHours: number | null;
    actualHours: number | null; pendingHours: number | null }) => {
    const projects = {
      findById: vi.fn().mockResolvedValue({ id: projectId, isDeleted: false }),
    } as unknown as ProjectRepository;
    const modules = {
      listForProject: vi.fn().mockResolvedValue([{
        id: 'module-1', name: 'Desarrollo', currentStage: 'development',
        segments: [{
          id: 'segment-1', name: 'Calculadora', teamId: 'team-1', teamName: 'Desarrollo',
          startDate: new Date('2026-11-01T12:00:00.000Z'),
          endDate: new Date('2026-11-30T12:00:00.000Z'),
        }],
        tasks: [{
          id: 'task-1', name: 'Modelo de datos', segmentId: 'segment-1',
          assigneeUserId: memberId, teamId: 'team-1', cancelledAt: null,
          ...taskHours,
        }],
      }]),
    } as unknown as ProjectModuleRepository;
    return new ListProjectPhasesUseCase(
      projects,
      { listForProject: vi.fn().mockResolvedValue([]) } as unknown as ProjectTeamMemberRepository,
      { findByProject: vi.fn().mockResolvedValue([{
        teamId: 'team-1', leaderName: 'Eduardo Aranda', leaderUserId: 'leader-1',
      }]) } as unknown as ProjectTeamRepository,
      modules,
    );
  };

  it('devuelve las 10 HH estimadas separadas de 3 aprobadas y 2 pendientes', async () => {
    const useCase = createCase({ estimatedHours: 10, actualHours: 3, pendingHours: 2 });
    const result = await useCase.execute({
      projectId,
      actorUserId: memberId,
      actorPermissions: ['projects:read'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]?.tasks[0]).toMatchObject({
        name: 'Modelo de datos', estimatedHours: 10, actualHours: 3,
        pendingHours: 2, segmentId: 'segment-1', assigneeUserId: memberId,
      });
      expect(result.value[0]?.segments[0]).toMatchObject({
        name: 'Calculadora', leaderName: 'Eduardo Aranda',
        teamId: 'team-1', eligibleForHours: false,
      });
    }
  });

  it('no convierte registros ausentes en horas reales inventadas', async () => {
    const useCase = createCase({ estimatedHours: 10, actualHours: null, pendingHours: null });
    const result = await useCase.execute({
      projectId,
      actorUserId: memberId,
      actorPermissions: ['projects:read'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]?.tasks[0]).toMatchObject({
        estimatedHours: 10, actualHours: null, pendingHours: null,
      });
    }
  });
});
