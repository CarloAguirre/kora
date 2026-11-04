import { describe, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ProjectTeamRepository } from '../../domain/repositories/project-team.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ProjectChangeLogRecorder } from '../services/project-change-log.recorder';
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import { FixedClock, PassthroughUnitOfWork } from '../../../../test/fakes';
import { DeleteProjectModuleTaskUseCase } from './delete-project-module-task.use-case';

const versionId = '0777e456-fd76-445e-83f1-afc25061c106';
function fixture(description: string | null) {
  const modules = {
    findById: vi.fn().mockResolvedValue({
      id: 'module-1', projectId: 'project-1', name: 'Reportería',
      tasks: [{
        id: 'task-1', name: 'Casos de prueba', teamId: 'team-1',
        description, segmentId: null,
      }],
    }),
    removeTask: vi.fn().mockResolvedValue(undefined),
    excludeQuotationReference: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectModuleRepository;
  const useCase = new DeleteProjectModuleTaskUseCase(
    { findById: vi.fn().mockResolvedValue({
      id: 'project-1', isDeleted: false, leaderUserId: 'leader-1',
    }) } as unknown as ProjectRepository,
    modules,
    { isTeamLeaderForProject: vi.fn().mockResolvedValue(false) } as unknown as ProjectTeamRepository,
    { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder,
    { record: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectChangeLogRecorder,
    { recalculate: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectProgressRecalculator,
    new FixedClock(), new PassthroughUnitOfWork(),
  );
  return { modules, useCase };
}
const command = {
  projectId: 'project-1', moduleId: 'module-1', taskId: 'task-1',
  actor: { userId: 'leader-1', email: 'leader@example.org' },
  actorPermissions: ['projects:manage'] as const,
};

describe('Eliminar tarea EDT sin reintroducir la referencia comercial', () => {
  it('persiste exclusión de la referencia del Roadmap en la misma transacción que el borrado', async () => {
    const { modules, useCase } = fixture(
      'Referencia cotización ' + versionId + ' · WBS 1.2 · QA\\nCasos de prueba',
    );
    const result = await useCase.execute(command);
    expect(result.isOk()).toBe(true);
    expect(modules.excludeQuotationReference).toHaveBeenCalledWith({
      projectId: 'project-1', moduleId: 'module-1', versionId,
      wbs: '1.2', role: 'QA', actorUserId: 'leader-1',
    }, expect.anything());
    const removedInTx = vi.mocked(modules.removeTask).mock.calls[0]![1];
    const excludedInTx = vi.mocked(modules.excludeQuotationReference).mock.calls[0]![1];
    expect(excludedInTx).toBe(removedInTx);
  });

  it('elimina tareas sin referencia sin crear exclusiones', async () => {
    const { modules, useCase } = fixture('Trabajo manual');
    const result = await useCase.execute(command);
    expect(result.isOk()).toBe(true);
    expect(modules.removeTask).toHaveBeenCalled();
    expect(modules.excludeQuotationReference).not.toHaveBeenCalled();
  });
});
