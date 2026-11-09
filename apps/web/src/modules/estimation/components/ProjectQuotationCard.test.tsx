import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { ProjectQuotationCard } from './ProjectQuotationCard';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(), transfer: vi.fn(), remove: vi.fn(),
  transferredVersionId: null as string | null,
  versions: null as null | unknown[],
  permissions: ['projects:manage'] as string[],
  userId: '0777e456-fd76-445e-83f1-afc25061c109',
  lastRequestedQuotationProjectId: undefined as string | null | undefined,
}));
const base = {
  status: 'draft' as const, revision: 2, hourlyRate: 2,
  createdAt: '2026-11-01T10:00:00.000Z',
  origin: 'manual' as const, totalHours: 40,
  totalAmount: 80, netAmount: 80, currency: 'UF' as const,
  draft: {
    mode: 'team' as const,
    teams: [{ teamId: '0777e456-fd76-445e-83f1-afc25061c103',
      collaborators: 1, unit: 'week' as const, duration: 1,
      hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [], costs: [], assumptions: [], paymentPlan: [{name: 'Inicio', percent: 100, trigger: 'approval' as const}],
  },
};
const v1 = { ...base, id:'0777e456-fd76-445e-83f1-afc25061c105',
  versionNumber:1, name:'Propuesta original' };
const v2 = { ...base, id:'0777e456-fd76-445e-83f1-afc25061c106',
  versionNumber:2, name:'Alternativa' };
vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: mocks.userId } }),
}));
vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: (permission: string) => mocks.permissions.includes(permission),
  }),
}));
vi.mock('../api/quotation.queries', () => ({
  useProjectQuotation: (projectId: string | null) => {
    mocks.lastRequestedQuotationProjectId = projectId;
    return { data: { versions: mocks.versions ?? [v1,v2],
      transferredVersionId: mocks.transferredVersionId }, isLoading:false, error:null };
  },
  useAppliedQuotationPlanning: () => ({ data:null }),
  useDeleteQuotationVersion: () => ({
    mutateAsync:mocks.remove,isPending:false,
  }),
  useQuotationLifecycle: () => ({
    approveClient:{mutateAsync:mocks.approve,isPending:false},
    transferApproved:{mutateAsync:mocks.transfer,isPending:false},
  }),
}));
vi.mock('@/app/router/paths', () => ({
  projectQuotationPath: () => '/project/quotation',
}));
vi.mock('./NewProjectQuotationModal', () => ({
  NewProjectQuotationModal: () => null,
}));
const project = {
  id:'0777e456-fd76-445e-83f1-afc25061c101',
  name:'Proyecto', type:'development', status:'draft', salesStage:'quoted',
  leader: { id:'0777e456-fd76-445e-83f1-afc25061c108' },
  teams:[{teamId:'0777e456-fd76-445e-83f1-afc25061c103',teamName:'Desarrollo'}],
} as unknown as ProjectDetail;
beforeEach(() => {
  mocks.permissions = ['projects:manage'];
  mocks.userId = '0777e456-fd76-445e-83f1-afc25061c109';
  mocks.lastRequestedQuotationProjectId = undefined;
  mocks.transferredVersionId = null;
  mocks.versions = null;
  mocks.approve.mockReset().mockResolvedValue({ revision: 3 });
  mocks.transfer.mockReset().mockResolvedValue({});
  mocks.remove.mockReset().mockResolvedValue({ deletedVersionId: v1.id });
});
describe('Cotizaciones del proyecto', () => {
  it('permite aprobar la versión 1 aun cuando existe la versión 2', async () => {
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    const approvals = screen.getAllByRole('button',{name:'Registrar aprobación'});
    expect(approvals).toHaveLength(2);
    const first = screen.getByText(/v1 · Propuesta original/).closest('tr')!;
    fireEvent.click(first.querySelector('button')!);
    expect(within(screen.getByRole('dialog')).getByText(/v1 · Propuesta original/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name:'Registrar aprobación' }));
    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith({
      versionId:v1.id,revision:2,confirmWithoutSend:true,
    }));
    expect(await screen.findByText('Traspasar a la ficha del proyecto')).toBeInTheDocument();
    expect(mocks.transfer).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name:'Dejar pendiente' }));
    expect(mocks.transfer).not.toHaveBeenCalled();
  });
  it('cuando falta configurar, Registrar aprobación navega a la calculadora sin aprobar', () => {
    mocks.versions = [{
      ...v1, origin: 'ai', aiReviewStatus: 'pending',
      hourlyRate: null, netAmount: null, totalAmount: null,
      draft: { ...v1.draft, paymentPlan: [] },
    }];
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    const approval = screen.getByRole('link', { name: 'Registrar aprobación' });
    expect(approval).toHaveAttribute('href', '/project/quotation?version=' + v1.id);
    expect(approval).toHaveAttribute('title', expect.stringContaining('plan de pago'));
    expect(approval).toHaveAttribute('title', expect.stringContaining('valor HH'));
    expect(approval).toHaveAttribute('title', expect.stringContaining('Acepta la propuesta IA'));
    expect(screen.queryByRole('button', { name: 'Registrar aprobación' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Faltan \d+ requisitos/)).not.toBeInTheDocument();
    expect(mocks.approve).not.toHaveBeenCalled();
  });
  it('permite el flujo normal cuando tarifa, monto, pagos y aceptación IA están completos', () => {
    mocks.versions = [{ ...v1, origin: 'ai', aiReviewStatus: 'accepted' }];
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    const approval = screen.getByRole('button', { name: 'Registrar aprobación' });
    expect(approval).toBeEnabled();
    expect(screen.queryByText(/Faltan \d+ requisitos/)).not.toBeInTheDocument();
    fireEvent.click(approval);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('expone solo las acciones de consulta y aprobación mientras falta traspasar', () => {
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(screen.getAllByRole('link', { name: 'Abrir en calculadora' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Registrar aprobación' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
  it('tras traspasar cierra todas las versiones y conserva sus enlaces de consulta', () => {
    mocks.transferredVersionId = v1.id;
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(screen.getByText(/Cotización aprobada y traspasada a la ficha del proyecto/)).toBeInTheDocument();
    expect(screen.getByText('Traspasada')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Abrir en calculadora' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Nueva versión/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar aprobación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registrar aprobación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Traspasar ahora' })).not.toBeInTheDocument();
  });

  it('el resumen comercial coincide con el prototipo y no muestra supuestos extensos', () => {
    mocks.transferredVersionId = v1.id;
    const confidentialAssumption = 'Supuesto contractual detallado que no debe aparecer en la ficha';
    mocks.versions = [{
      ...v1, status: 'approved',
      draft: { ...v1.draft,
        assumptions: [confidentialAssumption],
        costs: [{ description: 'Licencia anual', amount: 12.5, recurrence: 'annual' }] },
    }];
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(screen.getByText('Resumen comercial')).toBeInTheDocument();
    expect(screen.getByText('Solo usuarios de la calculadora')).toBeInTheDocument();
    expect(screen.getByText('Licencia o costo externo')).toBeInTheDocument();
    expect(screen.getByText('Licencia anual')).toBeInTheDocument();
    expect(screen.getByText('Anual')).toBeInTheDocument();
    expect(screen.queryByText(confidentialAssumption)).not.toBeInTheDocument();
    expect(screen.queryByText(/Supuestos:/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver ficha comercial completa' }))
      .toHaveAttribute('href', '/project/quotation?version=' + v1.id);
  });

  it('solo usuarios de la calculadora reciben cotizaciones y resumen comercial', () => {
    mocks.transferredVersionId = v1.id;
    mocks.permissions = ['projects:read'];
    const view = render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(mocks.lastRequestedQuotationProjectId).toBeNull();
    expect(screen.queryByText('Resumen comercial')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Cotizaciones del proyecto' })).not.toBeInTheDocument();
    view.unmount();

    // Líder de otro proyecto: projects:read_assigned no concede acceso.
    mocks.permissions = ['projects:read_assigned'];
    mocks.userId = '0777e456-fd76-445e-83f1-afc25061c110';
    const outsider = render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(mocks.lastRequestedQuotationProjectId).toBeNull();
    expect(screen.queryByText('Resumen comercial')).not.toBeInTheDocument();
    outsider.unmount();

    // Líder asignado: mismo permiso que utiliza la API.
    mocks.userId = '0777e456-fd76-445e-83f1-afc25061c108';
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(mocks.lastRequestedQuotationProjectId).toBe(project.id);
    expect(screen.getByText('Solo usuarios de la calculadora')).toBeInTheDocument();
  });

  it('una versión histórica legada sin costos ni supuestos no rompe el resumen tras el traspaso', () => {
    mocks.transferredVersionId = v1.id;
    mocks.versions = [{
      ...v1, status: 'approved',
      draft: { ...v1.draft, costs: undefined, assumptions: undefined },
    }];
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(screen.getByText(/Resumen comercial/)).toBeInTheDocument();
    expect(screen.getByText('Traspasada')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver ficha comercial completa' }))
      .toHaveAttribute('href', '/project/quotation?version=' + v1.id);
  });

  it('en el tab distingue borrador IA por revisar y aprobada con traspaso pendiente', () => {
    mocks.versions = [
      { ...v1, status: 'draft', origin: 'ai', aiReviewStatus: 'pending' },
      { ...v2, status: 'approved' },
    ];
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(screen.getByText('Borrador')).toBeInTheDocument();
    expect(screen.getByText('✦ Por revisar')).toBeInTheDocument();
    expect(screen.getByText('Aprobada por el cliente')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Traspasar ahora' })).toBeInTheDocument();
  });

  it('en aprobación pendiente de traspaso abre el modal correspondiente sin volver a aprobar', () => {
    mocks.versions = [{ ...v1, status: 'approved' }];
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(screen.getByRole('button', { name: 'Traspasar ahora' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Registrar aprobación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Registrar aprobación' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Traspasar ahora' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
