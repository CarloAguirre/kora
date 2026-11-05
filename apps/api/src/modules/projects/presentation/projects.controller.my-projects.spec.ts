import { describe, expect, it, vi } from 'vitest';
import { err, ok, ForbiddenError } from '@kora/core';
import type { ListProjectsQuery, ProjectDetail } from '@kora/contracts';
import type { RequestUser } from '../../../shared/presentation/decorators/current-user.decorator';
import { ProjectsController } from './projects.controller';

/**
 * El visor del colaborador NO debe heredar proyectos:read, ni aceptar un
 * assignedToUserId o teamId arbitrario aunque el actor fuerce parámetros.
 */
function controllerWithMocks() {
  const listProjects = { execute: vi.fn().mockResolvedValue(ok({
    items: [], page: 1, pageSize: 10, pageCount: 1, total: 0,
  })) };
  const getProject = { execute: vi.fn() };
  const collaboratorActivity = {
    weeklyHours: vi.fn().mockResolvedValue(new Map()),
    approvedEvents: vi.fn().mockResolvedValue({ entries: [], truncated: false }),
  };
  const controller = Object.assign(Object.create(ProjectsController.prototype), {
    listProjects, getProject, collaboratorActivity,
  }) as ProjectsController;
  const actor = { id: 'collaborator-1', permissions: ['projects:read'] } as unknown as RequestUser;
  return { controller, actor, listProjects, getProject, collaboratorActivity };
}

describe('ProjectsController — visor personal de colaborador', () => {
  it('ignora filtros de terceros y nunca habilita lectura global', async () => {
    const { controller, actor, listProjects } = controllerWithMocks();
    const query = {
      page: 1, pageSize: 10, sortField: 'createdAt', sortDirection: 'desc',
      assignedToUserId: 'another-user', teamId: 'another-team', clientId: 'another-client',
    } as ListProjectsQuery;
    const result = await controller.myProjects(query, actor);
    expect(result.items).toEqual([]);
    expect(listProjects.execute).toHaveBeenCalledWith(expect.objectContaining({
      actorPermissions: [],
      query: {
        page: 1, pageSize: 10, search: undefined,
        sortField: 'createdAt', sortDirection: 'desc',
      },
    }));
  });

  it('antes de consultar eventos, exige pertenencia al proyecto pedido', async () => {
    const { controller, actor, getProject, collaboratorActivity } = controllerWithMocks();
    getProject.execute.mockResolvedValue(err(new ForbiddenError(
      'No tienes acceso a este proyecto.', 'PROJECT_NOT_ASSIGNED',
    )));
    await expect(controller.myProjectDetail('other-project', actor)).rejects.toThrow();
    expect(getProject.execute).toHaveBeenCalledWith({
      projectId: 'other-project', actorUserId: 'collaborator-1', actorPermissions: [],
    });
    expect(collaboratorActivity.approvedEvents).not.toHaveBeenCalled();
  });

  it('proyecta detalle de consulta y neutraliza toda capacidad de edición', async () => {
    const { controller, actor, getProject } = controllerWithMocks();
    getProject.execute.mockResolvedValue(ok({
      id: 'project-1', name: 'Proyecto 1', slug: 'proyecto-1',
      type: 'development', status: 'active', phase: null,
      client: null, leader: null, startDate: '2026-11-01', endDate: '2026-12-01',
      progress: { actual: 10, expected: 25 }, estimatedDeliveryDate: '2026-12-01',
      modules: [{
        id: 'module-1', name: 'Fase 1', tasks: [], segments: [],
        deliveries: [{ id: 'delivery-1', canManage: true }],
      }],
      observations: [{
        id: 'obs-1', canEdit: true, canDelete: true, canResolve: true,
      }],
      contractAmount: 10000, quotationLink: 'https://private.invalid',
    } as unknown as ProjectDetail));
    const result = await controller.myProjectDetail('project-1', actor);
    expect(result.modules[0]?.deliveries[0]?.canManage).toBe(false);
    expect(result.observations[0]).toEqual(expect.objectContaining({
      canEdit: false, canDelete: false, canResolve: false,
    }));
    expect(result).not.toHaveProperty('contractAmount');
    expect(result).not.toHaveProperty('quotationLink');
    expect(result).not.toHaveProperty('paymentMilestones');
  });
});
