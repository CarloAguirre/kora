import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ProjectDetail } from '@kora/contracts';
import { TeamDeliveriesCard } from './TeamDeliveriesCard';

vi.mock('./DeliveryActionDialogs', () => ({
  DeliveryActionDialogs: ({ target }: { target: {
    action: string; blockTasks?: { status: string }[];
  } | null }) => target
    ? <div role="dialog" aria-label={'Acción entrega: ' + target.action}>
      {target.blockTasks?.filter((task) => task.status !== 'done').length ?? 0} pendientes
    </div> : null,
}));

const teamId = '0777e456-fd76-445e-83f1-afc25061c101';
const otherTeamId = '0777e456-fd76-445e-83f1-afc25061c102';
const projectId = '0777e456-fd76-445e-83f1-afc25061c103';
const segmentId = '0777e456-fd76-445e-83f1-afc25061c110';
const delivery = (status: 'planned' | 'delivered' | 'approved', canManage = true) => ({
  id: '0777e456-fd76-445e-83f1-afc25061c104',
  teamId, status, canManage, assigneeUserId: null, assigneeName: null,
  segmentId, segmentName: 'Bloque núcleo', completedOn: null,
  name: 'Entregable de Desarrollo', rejectionReason: null, estimatedDate: '2026-11-15',
});
const project = (status: 'planned' | 'delivered' | 'approved' = 'planned',
  canManage = true): ProjectDetail => ({
  id: projectId, members: [],
  modules: [{
    id: '0777e456-fd76-445e-83f1-afc25061c106',
    name: 'Desarrollo',
    segments: [{
      id: segmentId, name: 'Bloque núcleo',
      teamId, startDate: '2026-11-01', endDate: '2026-11-15',
    }],
    deliveries: [
      delivery(status, canManage),
      { ...delivery('planned'), id: '0777e456-fd76-445e-83f1-afc25061c107',
        name: 'Entrega de QA', teamId: otherTeamId },
    ],
  }],
} as unknown as ProjectDetail);

describe('Entregas del equipo · tabla del prototipo', () => {
  it('muestra seis columnas y filtros en las vistas PM y líder sin columna Colaborador', () => {
    for (const managerView of [true, false]) {
      const view = render(<TeamDeliveriesCard project={project()} projectId={projectId}
        teamId={teamId} managerView={managerView} />);
      const headings = screen.getAllByRole('columnheader').map((header) => header.textContent?.trim());
      expect(headings).toEqual([
        'Entrega', 'Bloque de trabajo', 'Módulo', 'Estado', 'Fecha objetivo', '',
      ]);
      expect(screen.getByText('Entregable de Desarrollo')).toBeInTheDocument();
      expect(screen.getByText('Bloque núcleo')).toBeInTheDocument();
      expect(screen.queryByText('Entrega de QA')).not.toBeInTheDocument();
      expect(screen.getByText('Todas 1')).toBeInTheDocument();
      expect(screen.getByText('Planificadas 1')).toBeInTheDocument();
      expect(screen.getByText('Vencidas 0')).toBeInTheDocument();
      expect(screen.getByText('Entregadas 0')).toBeInTheDocument();
      view.unmount();
    }
  });

  it('sin colaborador asignado permite al líder cerrar el bloque mediante fecha/evidencia', () => {
    render(<TeamDeliveriesCard project={project()} projectId={projectId} teamId={teamId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como entregada' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: finalize' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Asignar responsable' })).not.toBeInTheDocument();
  });

  it('una entrega independiente sin bloque se envía a revisión sin asignación obligatoria', () => {
    const independent = project();
    independent.modules[0]!.deliveries[0]!.segmentId = null;
    render(<TeamDeliveriesCard project={independent} projectId={projectId} teamId={teamId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como entregada' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: complete' })).toBeInTheDocument();
  });

  it('una entrega pendiente permite aprobar y una aprobada no permite entregarse de nuevo', () => {
    const view = render(<TeamDeliveriesCard project={project('delivered')}
      projectId={projectId} teamId={teamId} managerView />);
    expect(screen.getByText('Entregadas 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar entrega' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: approve' })).toBeInTheDocument();
    view.unmount();
    render(<TeamDeliveriesCard project={project('approved')}
      projectId={projectId} teamId={teamId} managerView />);
    expect(screen.getByText('Entregadas 1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar como entregada' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revertir entrega' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: reopen' })).toBeInTheDocument();
  });

  it('actualiza tareas del aviso tras cambiar sus estados, sin reabrir el modal', () => {
    const input = project();
    input.modules[0]!.tasks = [{
      id: 'task-1', teamId, segmentId, status: 'in_review', cancelledAt: null,
    }] as ProjectDetail['modules'][number]['tasks'][number][];
    const view = render(<TeamDeliveriesCard project={input} projectId={projectId} teamId={teamId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Marcar como entregada' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: finalize' }))
      .toHaveTextContent('1 pendientes');
    const updated: ProjectDetail = {
      ...input, modules: [{
        ...input.modules[0]!,
        tasks: [{ ...input.modules[0]!.tasks[0]!, status: 'done' }],
      }],
    };
    view.rerender(<TeamDeliveriesCard project={updated} projectId={projectId} teamId={teamId} />);
    expect(screen.getByRole('dialog', { name: 'Acción entrega: finalize' }))
      .toHaveTextContent('0 pendientes');
  });

  it('reversion independiente usa transición normal, sin reopenBlock', () => {
    const independent = project('approved');
    independent.modules[0]!.deliveries[0]!.segmentId = null;
    render(<TeamDeliveriesCard project={independent} projectId={projectId} teamId={teamId} />);
    fireEvent.click(screen.getByRole('button', { name: 'Revertir entrega' }));
    expect(screen.getByRole('dialog', { name: 'Acción entrega: revert' })).toBeInTheDocument();
  });

  it('sin permisos de gestión no permite entregar ni aprobar', () => {
    render(<TeamDeliveriesCard project={project('planned', false)}
      projectId={projectId} teamId={teamId} />);
    expect(screen.queryByRole('button', { name: 'Marcar como entregada' })).not.toBeInTheDocument();
  });
});
