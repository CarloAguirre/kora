import { describe, expect, it, vi } from 'vitest';
import { ok } from '@kora/core';
import type { RequestUser } from '../../../../shared/presentation/decorators/current-user.decorator';
import type { GetProjectUseCase } from '../use-cases/get-project.use-case';
import type { RoadmapReferenceExclusionStore } from '../ports/roadmap-reference-exclusion-store.port';
import { ProjectRoadmapReferenceExclusionsService } from './project-roadmap-reference-exclusions.service';

const versionId = '0777e456-fd76-445e-83f1-afc25061c106';
const actor = {
  id: 'leader-1', permissions: ['projects:read_assigned'], email: 'pm@example.com',
} as RequestUser;
const input = { versionId, wbs: '1.2', role: 'QA' };

function setup(belongs = true) {
  const store = {
    list: vi.fn().mockResolvedValue([{ moduleId: 'module-1', ...input }]),
    versionBelongsToProject: vi.fn().mockResolvedValue(belongs),
    suppress: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
  };
  const getProject = {
    execute: vi.fn().mockResolvedValue(ok({
      id: 'project-1', leader: { id: 'leader-1' },
      modules: [{ id: 'module-1' }],
    })),
  } as unknown as GetProjectUseCase;
  return {
    store,
    service: new ProjectRoadmapReferenceExclusionsService(
      store as unknown as RoadmapReferenceExclusionStore, getProject,
    ),
  };
}

describe('Exclusiones de referencias EDT (aplicación solo usa puerto)', () => {
  it('lee las exclusiones de un proyecto autorizado mediante el puerto', async () => {
    const { service, store } = setup();
    expect(await service.list('project-1', actor)).toEqual([{ moduleId: 'module-1', ...input }]);
    expect(store.list).toHaveBeenCalledWith('project-1');
  });

  it('permite al líder excluir referencias de la versión que pertenece al proyecto', async () => {
    const { service, store } = setup();
    await service.suppress('project-1', 'module-1', input, actor);
    expect(store.versionBelongsToProject).toHaveBeenCalledWith('project-1', versionId);
    expect(store.suppress).toHaveBeenCalledWith('project-1', 'module-1', input, 'leader-1');
  });

  it('rechaza una versión ajena antes de persistir la exclusión', async () => {
    const { service, store } = setup(false);
    await expect(service.suppress('project-1', 'module-1', input, actor))
      .rejects.toThrow('La versión de cotización no pertenece a este proyecto');
    expect(store.suppress).not.toHaveBeenCalled();
  });
});
