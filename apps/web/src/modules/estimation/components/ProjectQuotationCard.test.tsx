import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ProjectDetail } from '@kora/contracts';
import { ProjectQuotationCard } from './ProjectQuotationCard';

const mocks = vi.hoisted(() => ({
  approve: vi.fn(), transfer: vi.fn(), remove: vi.fn(),
  transferredVersionId: null as string | null,
  versions: null as null | unknown[],
}));
const base = {
  status: 'draft' as const, revision: 2,
  createdAt: '2026-11-01T10:00:00.000Z',
  origin: 'manual' as const, totalHours: 40,
  totalAmount: 80, netAmount: 80, currency: 'UF' as const,
  draft: {
    mode: 'team' as const,
    teams: [{ teamId: '0777e456-fd76-445e-83f1-afc25061c103',
      collaborators: 1, unit: 'week' as const, duration: 1,
      hoursPerWeek: 40, dedicationPercent: 100 }],
    phases: [], paymentPlan: [{name: 'Inicio', percent: 100, trigger: 'approval' as const}],
  },
};
const v1 = { ...base, id:'0777e456-fd76-445e-83f1-afc25061c105',
  versionNumber:1, name:'Propuesta original' };
const v2 = { ...base, id:'0777e456-fd76-445e-83f1-afc25061c106',
  versionNumber:2, name:'Alternativa' };
vi.mock('../api/quotation.queries', () => ({
  useProjectQuotation: () => ({
    data: { versions: mocks.versions ?? [v1,v2], transferredVersionId: mocks.transferredVersionId }, isLoading:false, error:null,
  }),
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
  teams:[{teamId:'0777e456-fd76-445e-83f1-afc25061c103',teamName:'Desarrollo'}],
} as unknown as ProjectDetail;
beforeEach(() => {
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
  it('confirma la eliminación de la versión seleccionada', async () => {
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    const buttons=screen.getAllByRole('button',{name:'Eliminar'});
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[1]!);
    fireEvent.click(screen.getByRole('button', { name:'Eliminar cotización' }));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith({
      versionId:v1.id,revision:2,
    }));
    expect(screen.queryByText(/Eliminar cotización v1/)).not.toBeInTheDocument();
  });
  it('tras traspasar cierra todas las versiones y conserva sus enlaces de consulta', () => {
    mocks.transferredVersionId = v1.id;
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    expect(screen.getByText(/Cotización aprobada y traspasada a la ficha del proyecto/)).toBeInTheDocument();
    expect(screen.getByText('Traspasada')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Abrir en calculadora' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Nueva versión/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar aprobación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Traspasar ahora' })).not.toBeInTheDocument();
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

  it('no elimina si el usuario cancela la confirmación', () => {
    render(<MemoryRouter><ProjectQuotationCard project={project}/></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button',{name:'Eliminar'})[0]!);
    fireEvent.click(screen.getByRole('button', { name:'Cancelar' }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
