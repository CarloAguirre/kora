import { describe, expect, it, vi } from 'vitest';
import type { ProjectRepository } from '../../domain/repositories/project.repository';
import type { ProjectModuleRepository } from '../../domain/repositories/project-module.repository';
import type { ProjectProgressRecalculator } from '../services/project-progress-recalculator';
import type { AuditRecorder } from '../../../../shared/application/ports/audit-recorder.port';
import { FixedClock } from '../../../../test/fakes';
import { CreateProjectModuleUseCase } from './create-project-module.use-case';

describe('Crear fase macro sin fechas ni HH ficticias', () => {
  it('persiste HH nulas y devuelve el id para abrir el primer bloque', async () => {
    const create = vi.fn().mockResolvedValue('module-new');
    const progress = vi.fn().mockResolvedValue(undefined);
    const audit = vi.fn().mockResolvedValue(undefined);
    const useCase = new CreateProjectModuleUseCase(
      { findById: vi.fn().mockResolvedValue({
        id: 'project-1', isDeleted: false, leaderUserId: 'leader-1',
      }) } as unknown as ProjectRepository,
      { create } as unknown as ProjectModuleRepository,
      { recalculate: progress } as unknown as ProjectProgressRecalculator,
      { record: audit } as unknown as AuditRecorder,
      new FixedClock(),
    );
    const result = await useCase.execute({
      projectId: 'project-1',
      data: { name: 'Cierre', initialStage: 'discovery' },
      actor: { userId: 'leader-1', email: 'pm@example.com' },
      actorPermissions: ['projects:manage'],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value).toEqual({ id: 'module-new' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1', name: 'Cierre',
      initialStage: 'discovery', estimatedHours: null,
      estimatedStartDate: null, estimatedEndDate: null,
    }), expect.any(Date));
    expect(progress).toHaveBeenCalledWith('project-1');
    expect(audit).toHaveBeenCalledOnce();
  });
});
