import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(),
}));
vi.mock('@/shared/lib/api-client', () => ({ api: request }));
import { clientPortalApi } from './client-portal.api';

beforeEach(() => {
  vi.resetAllMocks();
  request.get.mockResolvedValue({});
  request.post.mockResolvedValue({});
  request.patch.mockResolvedValue({});
});

describe('Portal externo: endpoints autónomos, sin APIs internas de PMO', () => {
  it('consulta solo identidad y recursos autorizados bajo /portal', async () => {
    await clientPortalApi.me();
    await clientPortalApi.projects();
    await clientPortalApi.project('proyecto/ajeno');
    await clientPortalApi.support();
    await clientPortalApi.contract('contrato/ajeno');
    expect(request.get.mock.calls.map((args) => args[0])).toEqual([
      '/portal/me', '/portal/projects', '/portal/projects/proyecto%2Fajeno',
      '/portal/support', '/portal/support/contrato%2Fajeno',
    ]);
  });

  it('registra recepción con POST separado de la aprobación interna', async () => {
    await clientPortalApi.receive('proyecto 1', 'entrega 2');
    expect(request.post).toHaveBeenCalledWith(
      '/portal/projects/proyecto%201/deliveries/entrega%202/receive');
    expect(request.patch).not.toHaveBeenCalled();
  });

  it('restringe la configuración de permisos al endpoint de contacto del cliente', async () => {
    const payload = { enabled: true, projectIds: [], supportPlanIds: [] };
    await clientPortalApi.setGrant('cliente/1', 'contacto/2', payload);
    expect(request.patch).toHaveBeenCalledWith(
      '/clients/cliente%2F1/portal-access/contacts/contacto%2F2', payload);
  });
});
