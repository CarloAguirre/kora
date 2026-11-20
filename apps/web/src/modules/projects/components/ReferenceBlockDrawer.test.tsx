import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  AppliedQuotationPlanning, ProjectDetail, ProjectModule, ProjectModuleTask,
} from '@kora/contracts';
import { ReferenceBlockDrawer } from './ReferenceBlockDrawer';

vi.mock('@/shared/components/ui/Modal', () => ({
  Modal: ({ children, title, footer }: {
    children: ReactNode; title: string; footer?: ReactNode;
  }) => <aside role="dialog" aria-label={title}>
    {children}{footer}
  </aside>,
}));

const referenceTask = {
  wbs: 'WBS-02-01', role: 'UX-UI', teamId: 'team-ux',
  name: 'Diseñar flujos y prototipo por rol', hours: 28,
  description: 'Diseñar los flujos de la experiencia',
} as AppliedQuotationPlanning['modules'][number]['tasks'][number];

const project = {
  id: 'project-1', status: 'pending', startDate: null,
  teams: [{
    teamId: 'team-ux', teamName: 'UX-UI',
    leader: { fullName: 'Eduardo Aranda' },
  }],
  members: [],
} as unknown as ProjectDetail;

const operationalTask = {
  id: 'task-1', teamId: 'team-ux',
  name: 'Ajustar prototipo', assigneeUserId: null,
  assigneeName: null, status: 'todo', estimatedHours: 8,
  actualHours: null, description: null, date: '2026-11-30',
} as unknown as ProjectModuleTask;

const moduleBase = {
  id: 'module-1', name: 'S2 · Diseño de experiencia y preparación técnica',
  tasks: [] as ProjectModuleTask[],
} as ProjectModule;

const block = { teamId: 'team-ux', hours: 28, startWeek: 1, durationWeeks: 3 } as
  NonNullable<AppliedQuotationPlanning['modules'][number]['relativeTeamBlocks']>[number];
const reference = { moduleId: moduleBase.id, tasks: [referenceTask] } as
  AppliedQuotationPlanning['modules'][number];

function show(options: {
  module?: ProjectModule;
  canManage?: boolean;
} = {}) {
  const onEditReference = vi.fn();
  const onDuplicateReference = vi.fn();
  const onDeleteReference = vi.fn();
  const onEditTask = vi.fn();
  const onDuplicateTask = vi.fn();
  const onDeleteTask = vi.fn();
  const canManage = options.canManage ?? true;
  render(<ReferenceBlockDrawer
    project={project} module={options.module ?? moduleBase}
    block={block} reference={reference} versionId="version-1"
    onClose={vi.fn()}
    onEditReference={canManage ? onEditReference : undefined}
    onDuplicateReference={canManage ? onDuplicateReference : undefined}
    onDeleteReference={canManage ? onDeleteReference : undefined}
    onEditTask={canManage ? onEditTask : undefined}
    onDuplicateTask={canManage ? onDuplicateTask : undefined}
    onDeleteTask={canManage ? onDeleteTask : undefined}
  />);
  return { onEditReference, onDuplicateReference, onDeleteReference,
    onEditTask, onDuplicateTask, onDeleteTask };
}

describe('Panel lateral EDT: acciones consistentes con bloques operativos', () => {
  it('muestra las referencias pendientes en filas con estado y tres iconos', () => {
    const handlers = show();
    const drawer = screen.getByRole('dialog', { name: moduleBase.name });
    expect(within(drawer).getByRole('heading', { name: 'Tareas (1)' })).toBeInTheDocument();
    expect(within(drawer).getByText('Por asignar')).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Asignar tarea' })).not.toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', {
      name: 'Editar tarea Diseñar flujos y prototipo por rol',
    }));
    fireEvent.click(within(drawer).getByRole('button', {
      name: 'Duplicar tarea Diseñar flujos y prototipo por rol',
    }));
    fireEvent.click(within(drawer).getByRole('button', {
      name: 'Eliminar tarea Diseñar flujos y prototipo por rol',
    }));
    expect(handlers.onEditReference).toHaveBeenCalledWith(referenceTask);
    expect(handlers.onDuplicateReference).toHaveBeenCalledWith(referenceTask);
    expect(handlers.onDeleteReference).toHaveBeenCalledWith(referenceTask);
  });

  it('reutiliza los mismos iconos para tareas reales todavía sin asignar', () => {
    const handlers = show({
      module: { ...moduleBase, tasks: [operationalTask] },
    });
    const drawer = screen.getByRole('dialog', { name: moduleBase.name });
    expect(within(drawer).getByRole('heading', { name: 'Tareas (2)' })).toBeInTheDocument();
    expect(within(drawer).getAllByText('Por asignar')).toHaveLength(2);
    fireEvent.click(within(drawer).getByRole('button', { name: 'Editar tarea Ajustar prototipo' }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Duplicar tarea Ajustar prototipo' }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Eliminar tarea Ajustar prototipo' }));
    expect(handlers.onEditTask).toHaveBeenCalledWith(operationalTask);
    expect(handlers.onDuplicateTask).toHaveBeenCalledWith(operationalTask);
    expect(handlers.onDeleteTask).toHaveBeenCalledWith(operationalTask);
  });

  it('no presenta acciones de mutación al usuario sin permiso', () => {
    show({ canManage: false });
    const drawer = screen.getByRole('dialog', { name: moduleBase.name });
    expect(within(drawer).queryByRole('button', { name: /Editar tarea/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /Duplicar tarea/ })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: /Eliminar tarea/ })).not.toBeInTheDocument();
    expect(within(drawer).getByText('Por asignar')).toBeInTheDocument();
  });
});
