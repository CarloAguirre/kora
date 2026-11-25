import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../../shared/presentation/decorators/require-permissions.decorator';
import { ClientPortalAccessController, ClientPortalController } from './client-portal.controller';
import type { ClientPortalService } from './client-portal.service';
import type { RequestUser } from '../../shared/presentation/decorators/current-user.decorator';

const customer = { id: '00000000-0000-4000-8000-000000000001', role: 'cliente', email: 'cliente@example.com' } as RequestUser;
const admin = { id: '00000000-0000-4000-8000-000000000002', role: 'admin', email: 'admin@kabeli.cl' } as RequestUser;
const projectId = '00000000-0000-4000-8000-000000000003';
const deliveryId = '00000000-0000-4000-8000-000000000004';
const contactId = '00000000-0000-4000-8000-000000000005';

function setup() {
  const service = {
    me: vi.fn().mockResolvedValue({ company: { name: 'Empresa' } }),
    listProjects: vi.fn().mockResolvedValue([]),
    getProject: vi.fn().mockResolvedValue({ project: { id: projectId }, receipts: [] }),
    receiveDelivery: vi.fn().mockResolvedValue({ deliveryId, received: true }),
    listSupportPlans: vi.fn().mockResolvedValue([]),
    getSupportPlan: vi.fn().mockResolvedValue({ plan: { id: projectId }, tickets: [] }),
    listClientContactAccess: vi.fn().mockResolvedValue([]),
    setClientContactAccess: vi.fn().mockResolvedValue({ userId: customer.id, enabled: true }),
  };
  return { service, controller: new ClientPortalController(service as unknown as ClientPortalService),
    access: new ClientPortalAccessController(service as unknown as ClientPortalService) };
}

describe('Portal externo: no reutilizar autorización interna de PMO', () => {
  it('exige permisos own_client en cada consulta de cliente', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalController.prototype.projects))
      .toEqual(['projects:read_own_client']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalController.prototype.project))
      .toEqual(['projects:read_own_client']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalController.prototype.receive))
      .toEqual(['projects:read_own_client']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalController.prototype.support))
      .toEqual(['tickets:read_own_client']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalController.prototype.contract))
      .toEqual(['tickets:read_own_client']);
    expect(Reflect.getMetadata(ANY_PERMISSIONS_KEY, ClientPortalController.prototype.me))
      .toEqual(['projects:read_own_client', 'tickets:read_own_client']);
  });
  it('enruta únicamente el usuario autenticado y la entrega solicitada', async () => {
    const { service, controller } = setup();
    await controller.me(customer);
    await controller.projects(customer);
    await controller.project(customer, projectId);
    await controller.receive(customer, projectId, deliveryId);
    await controller.support(customer);
    await controller.contract(customer, projectId);
    expect(service.me).toHaveBeenCalledWith(customer);
    expect(service.listProjects).toHaveBeenCalledWith(customer);
    expect(service.getProject).toHaveBeenCalledWith(customer, projectId);
    expect(service.receiveDelivery).toHaveBeenCalledWith(customer, projectId, deliveryId);
    expect(service.listSupportPlans).toHaveBeenCalledWith(customer);
    expect(service.getSupportPlan).toHaveBeenCalledWith(customer, projectId);
  });
  it('requiere permisos administrativos independientes para conceder accesos', async () => {
    const { service, access } = setup();
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalAccessController.prototype.list))
      .toEqual(['clients:manage']);
    expect(Reflect.getMetadata(PERMISSIONS_KEY, ClientPortalAccessController.prototype.setAccess))
      .toEqual(['clients:manage', 'users:create']);
    const payload = { enabled: true, projectIds: [projectId], supportPlanIds: [] };
    await access.setAccess(projectId, contactId, payload, admin);
    expect(service.setClientContactAccess).toHaveBeenCalledWith(projectId, contactId, payload, admin);
  });
});
