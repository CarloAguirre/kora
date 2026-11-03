import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AppliedQuotationPlanning, ProjectDetail } from '@kora/contracts';
import { QuotationReferenceTaskModal } from './QuotationReferenceTaskModal';

const mocks = vi.hoisted(() => ({ create: vi.fn(), onClose: vi.fn() }));
const projectId = '0777e456-fd76-445e-83f1-afc25061c101';
const teamId = '0777e456-fd76-445e-83f1-afc25061c102';
const moduleId = '0777e456-fd76-445e-83f1-afc25061c103';
const userId = '0777e456-fd76-445e-83f1-afc25061c104';
const blockId = '0777e456-fd76-445e-83f1-afc25061c105';
const versionId = '0777e456-fd76-445e-83f1-afc25061c106';

vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) =>
    <div role="dialog" aria-label={title}>{children}{footer}</div>,
}));
vi.mock('../api/projects.queries', () => ({
  useCreateProjectModuleTask: () => ({ isPending: false, mutateAsync: mocks.create }),
}));

const project = {
  id: projectId, name: 'Pruebas Kora', slug: 'pruebas-kora',
  teams: [{teamId,teamName:'Desarrollo',teamSlug:'desarrollo'}],
  members: [{teamId,userId,fullName:'Persona asignada',userStatus:'active'}],
  modules: [{id:moduleId,name:'S1 · Desarrollo',segments:[{
    id:blockId,name:'Implementación',teamId,teamName:'Desarrollo',
    startDate:'2026-11-10',endDate:'2026-11-20',members:[],
  }], tasks:[]}],
} as unknown as ProjectDetail;
const reference = { wbs:'S1.01',name:'Conexión con sistema de taller',
  description:'Conectar API', role:'Backend',teamId,hours:35,
} as AppliedQuotationPlanning['modules'][number]['tasks'][number];

beforeEach(() => { mocks.create.mockReset().mockResolvedValue({}); mocks.onClose.mockClear(); });
const show = () => render(<MemoryRouter><QuotationReferenceTaskModal
  project={project} moduleId={moduleId} versionId={versionId} versionNumber={1}
  reference={reference} onClose={mocks.onClose}
  /></MemoryRouter>);

describe('Nueva tarea operativa a partir de referencia Gemini', () => {
  it('precarga tarea y HH sin generar ejecución al abrir el modal', () => {
    show();
    expect(screen.getByRole('dialog',{name:'Nueva tarea'})).toBeInTheDocument();
    expect(screen.getByLabelText('Título de la tarea')).toHaveValue('Conexión con sistema de taller');
    expect(screen.getByLabelText('HH estimadas')).toHaveValue(35);
    expect(screen.getByLabelText('Bloque de trabajo')).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('crea una tarea solo con colaborador, ámbito y fechas; preserva trazabilidad EDT', async () => {
    show();
    fireEvent.change(screen.getByLabelText('Asignado a'),{
      target: { value: teamId + ':' + userId },
    });
    fireEvent.change(screen.getByLabelText('Bloque de trabajo'), {
      target: { value: blockId },
    });
    fireEvent.change(screen.getByLabelText('Ámbito Kora'), {
      target: { value: 'desarrollo' },
    });
    fireEvent.click(screen.getByRole('button',{name:'Crear tarea'}));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create).toHaveBeenCalledWith({
      projectId, moduleId,
      input: expect.objectContaining({
        teamId, assigneeUserId:userId, name:'Conexión con sistema de taller',
        estimatedHours:35, startDate:'2026-11-10', date:'2026-11-20',
        scope:'desarrollo', status:'todo',
        description:expect.stringContaining('Referencia cotización ' + versionId),
      }),
    });
    expect(mocks.onClose).toHaveBeenCalledOnce();
  });
});
