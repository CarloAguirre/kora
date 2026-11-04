import { describe, expect, it, vi } from 'vitest';
import { CreateProjectModuleSegmentUseCase } from './create-project-module-segment.use-case';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ForecastSourceSyncService } from '../services/forecast-source-sync.service';
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { FixedClock, PassthroughUnitOfWork } from '../../../../test/fakes';

function fixture() {
  const projects = { findById: vi.fn().mockResolvedValue({
    id: 'project-1', isDeleted: false, leaderUserId: 'leader-1',
  }) } as unknown as ProjectRepository;
  const modules = {
    findById: vi.fn().mockResolvedValue({ id: 'module-1', projectId: 'project-1' }),
    addSegment: vi.fn().mockResolvedValue('segment-1'),
    addDelivery: vi.fn().mockResolvedValue('delivery-1'),
    replaceSegmentMembers: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectModuleRepository;
  const forecast = {
    membersBelongToTeam: vi.fn().mockResolvedValue(true),
    syncSegment: vi.fn().mockResolvedValue(undefined),
  } as unknown as ForecastSourceSyncService;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const progress = { recalculate: vi.fn().mockResolvedValue(undefined) } as unknown as ProjectProgressRecalculator;
  const useCase = new CreateProjectModuleSegmentUseCase(
    projects, modules, forecast, audit, new FixedClock(), new PassthroughUnitOfWork(), progress,
  );
  return { useCase, modules, forecast, audit };
}

const command = {
  projectId: 'project-1', moduleId: 'module-1',
  actor: { userId: 'leader-1', email: 'lider@example.org' },
  actorPermissions: ['projects:manage'] as const,
  data: {
    teamId: 'team-1', name: 'Diseño UX',
    startDate: '2026-11-05', endDate: '2026-11-20',
    estimatedHours: 60, members: [],
  },
};

describe('CreateProjectModuleSegmentUseCase — bloque y entrega de cierre', () => {
  it('guarda HH propias del bloque y la entrega de cierre con la misma transacción', async () => {
    const { useCase, modules, audit } = fixture();
    const result = await useCase.execute({
      ...command,
      data: { ...command.data, closingDelivery: {
        name: 'Diseños revisados', description: 'Flujos y pantallas',
      } },
    });
    expect(result.isOk()).toBe(true);
    expect(modules.addSegment).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'module-1', name: 'Diseño UX', estimatedHours: 60,
    }), expect.any(Date), expect.anything());
    expect(modules.addDelivery).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'module-1', segmentId: 'segment-1', teamId: 'team-1',
      name: 'Diseños revisados', description: 'Flujos y pantallas',
      assigneeUserId: null, estimatedDate: new Date('2026-11-20'),
    }), expect.any(Date), expect.anything());
    const segmentsTx = (modules.addSegment as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    const deliveryTx = (modules.addDelivery as ReturnType<typeof vi.fn>).mock.calls[0]![2];
    expect(deliveryTx).toBe(segmentsTx);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ createdClosingDelivery: true }),
    }));
  });

  it('sin entrega de cierre registra solamente el bloque', async () => {
    const { useCase, modules } = fixture();
    const result = await useCase.execute(command);
    expect(result.isOk()).toBe(true);
    expect(modules.addDelivery).not.toHaveBeenCalled();
  });

  it('si falla la entrega propaga el error antes de auditar (rollback por UnitOfWork)', async () => {
    const { useCase, modules, audit } = fixture();
    vi.mocked(modules.addDelivery).mockRejectedValueOnce(new Error('Entrega inválida'));
    await expect(useCase.execute({
      ...command, data: { ...command.data, closingDelivery: { name: 'Cierre' } },
    })).rejects.toThrow('Entrega inválida');
    expect(audit.record).not.toHaveBeenCalled();
  });
});
