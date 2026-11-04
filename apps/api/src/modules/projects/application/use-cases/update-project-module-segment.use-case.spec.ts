import { describe, expect, it, vi } from 'vitest';
import { UpdateProjectModuleSegmentUseCase } from './update-project-module-segment.use-case';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { FixedClock, PassthroughUnitOfWork } from '../../../../test/fakes';

function fixture(status = 'planned', tasks: unknown[] = []) {
  const projects = { findById: vi.fn().mockResolvedValue({
    id: 'project-1', isDeleted: false, leaderUserId: 'leader-1',
  }) } as unknown as ProjectRepository;
  const modules = {
    findById: vi.fn().mockResolvedValue({
      id: 'module-1', projectId: 'project-1',
      segments: [{ id: 'segment-1', teamId: 'team-1',
        startDate: new Date('2026-10-10'), endDate: new Date('2026-10-30'), members: [] }],
      tasks,
      deliveries: [{
        id: 'delivery-1', segmentId: 'segment-1', teamId: 'team-1', status,
        name: 'Cierre QA', estimatedDate: new Date('2026-10-30'), assigneeUserId: null,
      }],
    }),
    updateSegment: vi.fn().mockResolvedValue(undefined),
    updateDelivery: vi.fn().mockResolvedValue(undefined),
    removeDelivery: vi.fn().mockResolvedValue(undefined),
    addDelivery: vi.fn().mockResolvedValue('delivery-new'),
  } as unknown as ProjectModuleRepository;
  const forecast = { syncSegment: vi.fn().mockResolvedValue(undefined),
    membersBelongToTeam: vi.fn().mockResolvedValue(true) } as unknown as ForecastSourceSyncService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const useCase = new UpdateProjectModuleSegmentUseCase(
    projects, modules, forecast, audit, new FixedClock(), new PassthroughUnitOfWork(),
  );
  return { useCase, modules };
}
const command = {
  projectId: 'project-1', moduleId: 'module-1', segmentId: 'segment-1',
  actor: { userId: 'leader-1', email: 'leader@example.com' },
  actorPermissions: ['projects:manage'] as const,
};

describe('Edición y cierre de bloque operativo', () => {
  it('actualiza entrega vinculada y fechas dentro de la misma transacción', async () => {
    const { useCase, modules } = fixture();
    const result = await useCase.execute({ ...command, data: {
      endDate: '2026-11-05', estimatedHours: 80,
      closingDelivery: { name: 'QA revisado', description: 'Evidencias UAT' },
    } });
    expect(result.isOk()).toBe(true);
    expect(modules.updateSegment).toHaveBeenCalledWith('segment-1',
      expect.objectContaining({ endDate: new Date('2026-11-05'), estimatedHours: 80 }),
      expect.any(Date), expect.anything());
    expect(modules.updateDelivery).toHaveBeenCalledWith('delivery-1',
      expect.objectContaining({
        name: 'QA revisado', estimatedDate: new Date('2026-11-05'),
      }), expect.any(Date), expect.anything());
    expect(vi.mocked(modules.updateSegment).mock.calls[0]![3])
      .toBe(vi.mocked(modules.updateDelivery).mock.calls[0]![3]);
  });

  it('rechaza eliminar una entrega ya aprobada', async () => {
    const { useCase, modules } = fixture('approved');
    const result = await useCase.execute({ ...command, data: { closingDelivery: null } });
    expect(result.isErr()).toBe(true);
    expect(modules.removeDelivery).not.toHaveBeenCalled();
  });

  it('bloquea recortar el período dejando una tarea fuera del bloque', async () => {
    const { useCase, modules } = fixture('planned', [{
      segmentId: 'segment-1', teamId: 'team-1', status: 'done',
      startDate: new Date('2026-10-10'), date: new Date('2026-10-29'),
    }]);
    const result = await useCase.execute({ ...command, data: { endDate: '2026-10-20' } });
    expect(result.isErr()).toBe(true);
    expect(modules.updateSegment).not.toHaveBeenCalled();
  });

  it('reabre conservando la fecha planificada original', async () => {
    const { useCase, modules } = fixture();
    const result = await useCase.execute({ ...command, data: { closureAction: 'reopen' } });
    expect(result.isOk()).toBe(true);
    expect(modules.updateSegment).toHaveBeenCalledWith('segment-1',
      expect.objectContaining({ closedAt: null }), expect.any(Date), expect.anything());
    expect(modules.updateDelivery).not.toHaveBeenCalled();
  });
});
