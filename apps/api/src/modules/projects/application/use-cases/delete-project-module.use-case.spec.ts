import { describe, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { PassthroughUnitOfWork } from '../../../../test/fakes';
import { DeleteProjectModuleUseCase } from './delete-project-module.use-case';

const project = { id: 'project-1', leaderUserId: 'leader-1',
  isDeleted: false, soldHours: 1656.5, usedHours: 548.5 };
const module = { id: 'phase-2', projectId: 'project-1',
  name: 'S2 · Diseño de experiencia', estimatedHours: 28,
  segments: [{ id: 'block-ux' }],
  tasks: [{ id: 'task-ux', status: 'done' }],
  deliveries: [{ id: 'delivery-ux', status: 'approved' }],
};
function setup() {
  const projects = { findById: vi.fn().mockResolvedValue(project) } as unknown as ProjectRepository;
  const modules = {
    findById: vi.fn().mockResolvedValue(module),
    remove: vi.fn().mockResolvedValue(undefined),
  } as unknown as ProjectModuleRepository;
  const progress = { recalculate: vi.fn().mockResolvedValue(undefined) }
    as unknown as ProjectProgressRecalculator;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditRecorder;
  const useCase = new DeleteProjectModuleUseCase(
    projects, modules, progress, new PassthroughUnitOfWork(), audit,
  );
  return { useCase, projects, modules, progress, audit };
}
const command = {
  projectId: 'project-1', moduleId: 'phase-2',
  actor: { userId: 'leader-1', email: 'leader@example.org' },
  actorPermissions: ['projects:manage'] as const,
};

describe('Eliminar una fase poblada conservando HH vendidas/consumidas', () => {
  it('permite eliminar fases con tareas aprobadas y entregas en una transacción', async () => {
    const { useCase, modules, progress, audit } = setup();
    const result = await useCase.execute(command);
    expect(result.isOk()).toBe(true);
    expect(modules.remove).toHaveBeenCalledWith('phase-2', expect.anything());
    expect(progress.recalculate).toHaveBeenCalledWith('project-1', expect.anything());
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        event: 'module_deleted', estimatedHoursReleased: 28,
        removedSegmentIds: ['block-ux'], removedTaskIds: ['task-ux'],
        removedDeliveryIds: ['delivery-ux'],
        soldHoursPreserved: true, hourEntriesPreserved: true,
      }),
    }));
    expect(project.soldHours).toBe(1656.5);
    expect(project.usedHours).toBe(548.5);
  });
  it('impide borrar una fase sin permisos, incluso si existen tareas', async () => {
    const { useCase, modules } = setup();
    const result = await useCase.execute({ ...command,
      actor: { userId: 'other', email: 'other@example.org' },
      actorPermissions: [],
    });
    expect(result.isOk()).toBe(false);
    expect(modules.remove).not.toHaveBeenCalled();
  });
  it('fallo al eliminar revierte la operación y no registra auditoría de éxito', async () => {
    const { useCase, modules, progress, audit } = setup();
    vi.mocked(modules.remove).mockRejectedValueOnce(new Error('rollback phase'));
    await expect(useCase.execute(command)).rejects.toThrow('rollback phase');
    expect(progress.recalculate).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
