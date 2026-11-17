import { describe, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import type { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import { FixedClock, PassthroughUnitOfWork } from '../../../../test/fakes';
import { DeleteProjectModuleSegmentUseCase } from './delete-project-module-segment.use-case';

function fixture() {
  const project = { id: 'project-1', isDeleted: false, leaderUserId: 'leader-1',
    soldHours: 1656.5, usedHours: 548.5 };
  const projects = { findById: vi.fn().mockResolvedValue(project),
    save: vi.fn() } as unknown as ProjectRepository;
  const modules = {
    findById: vi.fn().mockResolvedValue({
      id: 'module-1', projectId: 'project-1', estimatedHours: 1108,
      segments: [{ id: 'segment-1', estimatedHours: 52 }],
      tasks: [{ id: 'task-1', segmentId: 'segment-1', status: 'done' },
        { id: 'task-2', segmentId: 'segment-1', status: 'in_progress' }],
      deliveries: [{ id: 'delivery-1', segmentId: 'segment-1', status: 'approved' }],
    }),
    removeSegmentWithDependencies: vi.fn().mockResolvedValue({
      removed: true, taskCount: 2, deliveryCount: 1,
    }),
    removeSegment: vi.fn(),
    removeTask: vi.fn(),
    excludeQuotationReference: vi.fn(),
  } as unknown as ProjectModuleRepository;
  const forecast = { syncModuleTasks: vi.fn().mockResolvedValue(undefined) } as unknown as ForecastSourceSyncService;
  const progress = { recalculate: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectProgressRecalculator;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const uc = new DeleteProjectModuleSegmentUseCase(projects, modules,
    forecast, audit, new FixedClock(), new PassthroughUnitOfWork(), progress);
  return { uc, projects, modules, forecast, progress, audit, project };
}
const command = {
  projectId: 'project-1', moduleId: 'module-1', segmentId: 'segment-1',
  actor: { userId: 'leader-1', email: 'leader@example.org' },
  actorPermissions: ['projects:manage'] as const,
};

describe('Eliminar bloque operativo con tareas y entregas vinculadas', () => {
  it('elimina bloque y dependencias aun si hay tareas aprobadas y entrega aprobada', async () => {
    const { uc, modules, forecast, progress, audit, project } = fixture();
    const result = await uc.execute(command);
    expect(result.isOk()).toBe(true);
    expect(modules.removeSegmentWithDependencies).toHaveBeenCalledOnce();
    expect(modules.removeSegmentWithDependencies).toHaveBeenCalledWith('segment-1', ['task-1', 'task-2'], expect.anything());
    const tx = vi.mocked(modules.removeSegmentWithDependencies).mock.calls[0]![2];
    expect(forecast.syncModuleTasks).toHaveBeenCalledWith(
      project, 'module-1', expect.any(Date), tx);
    expect(progress.recalculate).toHaveBeenCalledWith('project-1', tx);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        event: 'module_segment_deleted',
        taskCount: 2, deliveryCount: 1,
        soldHoursPreserved: true, hourEntriesPreserved: true,
      }),
    }));
    expect(project.soldHours).toBe(1656.5);
    expect(project.usedHours).toBe(548.5);
    expect(modules.removeTask).not.toHaveBeenCalled();
    expect(modules.excludeQuotationReference).not.toHaveBeenCalled();
  });

  it('permite eliminar un bloque sin tareas ni entrega', async () => {
    const { uc, modules } = fixture();
    vi.mocked(modules.removeSegmentWithDependencies).mockResolvedValueOnce({
      removed: true, taskCount: 0, deliveryCount: 0,
    });
    expect((await uc.execute(command)).isOk()).toBe(true);
  });

  it('no elimina nada si el usuario no puede gestionar el proyecto', async () => {
    const { uc, modules } = fixture();
    const result = await uc.execute({
      ...command, actor: { userId: 'other', email: 'other@example.org' },
      actorPermissions: [],
    });
    expect(result.isOk()).toBe(false);
    expect(modules.removeSegmentWithDependencies).not.toHaveBeenCalled();
  });

  it('si la operación transaccional falla no recalcula, ni audita como eliminada', async () => {
    const { uc, modules, progress, audit } = fixture();
    vi.mocked(modules.removeSegmentWithDependencies)
      .mockRejectedValueOnce(new Error('rollback'));
    await expect(uc.execute(command)).rejects.toThrow('rollback');
    expect(progress.recalculate).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
