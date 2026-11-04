import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { PhaseRoadmap } from './PhaseRoadmap';
import type { ProjectPhaseRoadmap } from '../types';

const phaseRoadmap: ProjectPhaseRoadmap = {
  phaseCount: 1,
  teamSegmentCount: 0,
  plannedDeliveryCount: 0,
  rangeStartDate: '2026-11-01',
  rangeEndDate: '2026-12-01',
  phases: [{
    id: 'phase-2',
    badge: 'FASE 2',
    name: 'Desarrollo Backend',
    status: 'upcoming',
    alertLabel: null,
    tasks: [],
    deliveries: [],
    taskItems: [],
    relatedBitacora: [],
  }],
};

describe('Fases permanentes · vista interna v5', () => {
  it('mantiene visible el Gantt y no permite colapsar la fase desde su cabecera', () => {
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap} alwaysExpanded
      renderPhaseReferences={() => (
        <details aria-label="Tareas de cotización">
          <summary>Tareas de referencia de la cotización</summary>
          <p>Tarea propuesta de Gemini</p>
        </details>
      )} />);
    const header = screen.getByText('FASE 2').parentElement;
    expect(header).not.toHaveAttribute('role', 'button');
    expect(header).not.toHaveAttribute('aria-expanded');
    expect(screen.getByText('Resumen de avance')).toBeInTheDocument();
    expect(screen.getByText('Semanas')).toBeInTheDocument();
    expect(screen.getByText('Días')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Desarrollo Backend'));
    expect(screen.getByText('Resumen de avance')).toBeInTheDocument();
    const details = screen.getByText('Tareas de referencia de la cotización').closest('details');
    expect(details).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('Tareas de referencia de la cotización'));
    expect(details).toHaveAttribute('open');
  });
});

describe('Extensiones de cabecera en Roadmap compartido', () => {
  it('mantiene el nombre y encabezado del portal cliente cuando no hay acciones internas', () => {
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap} />);
    expect(screen.getByText('Desarrollo Backend')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Bloque de trabajo' })).not.toBeInTheDocument();
  });

  it('acciones y campo editable no despliegan/contraen la fase accidentalmente', () => {
    const addBlock = vi.fn();
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap}
      toolbarActions={<button type="button">Planificar</button>}
      renderPhaseHeaderName={() => <input aria-label="Nombre de la fase"
        defaultValue="Desarrollo Backend" />}
      renderPhaseHeaderActions={() => (
        <button type="button" onClick={addBlock}>+ Bloque de trabajo</button>
      )} />);
    const header = screen.getAllByRole('button').find((element) =>
      element.getAttribute('aria-expanded') === 'true');
    expect(header).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '+ Bloque de trabajo' }));
    expect(addBlock).toHaveBeenCalledOnce();
    expect(header).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nombre de la fase' }),
      { target: { value: 'Desarrollo Integraciones' } });
    expect(screen.getByRole('textbox', { name: 'Nombre de la fase' }))
      .toHaveValue('Desarrollo Integraciones');
    expect(header).toHaveAttribute('aria-expanded', 'true');
  });
});


describe('Roadmap operativo · diseño aprobado v5.02', () => {
  it('mantiene la fase abierta y muestra referencias sin inventar una barra ni fechas', () => {
    const plan = vi.fn();
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap}
      operationalView operationalTaskCount={18} operationalBlockCount={4}
      operationalRows={() => [{ id: 'team-pmo', role: 'pmo', label: 'Coordinación', hours: 36 }]}
      onPlanOperationalRow={plan}
      renderPhaseReferences={() => (
        <details open><summary>Tareas 18, 0 aprobadas</summary><div>Por asignar</div></details>
      )}
    />);
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('PMO')).toBeInTheDocument();
    expect(screen.getByText('Sin fechas: se calculan al definir el inicio del proyecto')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir bloque Coordinación' })).toBeInTheDocument();
    expect(screen.queryByText('Resumen de avance')).not.toBeInTheDocument();
    expect(screen.queryByText('Rango visible:')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Planificar bloque' }));
    expect(plan).toHaveBeenCalledOnce();
    expect(screen.getByText('Tareas 18, 0 aprobadas')).toBeInTheDocument();
  });

  it('abre el detalle de un bloque sin fechas desde el nombre o la zona temporal', () => {
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap} operationalView
      operationalRows={() => [{ id: 'team-pmo', role: 'pmo', label: 'Coordinación', hours: 36 }]}
      renderSelectionDetail={(_phase, selection, clear) =>
        <div>Detalle: {selection.kind}
          <button type="button" onClick={clear}>Cerrar detalle</button>
        </div>
      } />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir bloque Coordinación' }));
    expect(screen.getByText('Detalle: reference-block')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    expect(screen.queryByText('Detalle: reference-block')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', {
      name: 'Sin fechas: se calculan al definir el inicio del proyecto',
    }));
    expect(screen.getByText('Detalle: reference-block')).toBeInTheDocument();
  });

  it('reutiliza las barras reales y permite seleccionar su detalle sin colapsar el cronograma', () => {
    const withSegment: ProjectPhaseRoadmap = {
      ...phaseRoadmap,
      phases: [{
        ...phaseRoadmap.phases[0]!,
        tasks: [{ id: 'segment-01', role: 'dev', scope: 'desarrollo',
          label: 'Desarrollo backend', startDate: '2026-11-03', endDate: '2026-11-20' }],
      }],
    };
    render(<PhaseRoadmap phaseRoadmap={withSegment} operationalView
      operationalMetrics={() => ({ hours: 80, progress: 100 })}
      operationalFooter={<button type="button">+ Agregar fase</button>}
      renderSelectionDetail={(_phase, selection, clear) => (
        <div>Bloque seleccionado: {'label' in selection ? selection.label : 'Incidente'}
          <button type="button" onClick={clear}>Cerrar detalle</button>
        </div>
      )} />);
    const bar = screen.getByRole('button', { name: 'Abrir bloque Desarrollo backend' });
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('80 HH · 100% de avance')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Agregar fase' })).toBeInTheDocument();
    expect(bar).not.toHaveStyle({ opacity: '0.45' });
    fireEvent.click(bar);
    expect(screen.getByText('Bloque seleccionado: Desarrollo backend')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle' }));
    expect(screen.queryByText('Bloque seleccionado: Desarrollo backend')).not.toBeInTheDocument();
    expect(bar).toBeInTheDocument();
  });
});


describe('Controles históricos preservados en vista operativa', () => {
  it('permite abrir tareas y entregas fechadas sin mostrar el acordeón de etapa descartado', () => {
    const roadmap: ProjectPhaseRoadmap = {
      ...phaseRoadmap,
      phases: [{
        ...phaseRoadmap.phases[0]!,
        deliveries: [{ id: 'delivery-01', label: 'Entrega QA', date: '2026-11-12', state: 'committed' }],
        taskItems: [{ id: 'task-01', label: 'Validar interfaz', date: '2026-11-13',
          state: 'upcoming', scope: 'diseno' }],
      }],
    };
    render(<PhaseRoadmap phaseRoadmap={roadmap} operationalView
      renderPhaseExtras={() => <span>Etapa de Kora</span>}
      renderSelectionDetail={(_phase, selection) =>
        <div>Detalle: {'label' in selection ? selection.label : 'Incidente'}</div>
      } />);
    expect(screen.queryByText('Etapa y datos de la fase')).not.toBeInTheDocument();
    expect(screen.queryByText('Etapa de Kora')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText(/Entregas y tareas en el cronograma/));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir entrega Entrega QA' }));
    expect(screen.getByText('Detalle: Entrega QA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir tarea Validar interfaz' }));
    expect(screen.getByText('Detalle: Validar interfaz')).toBeInTheDocument();

    expect(screen.getByText('Opciones de cronograma · rango de fechas')).toBeInTheDocument();
    expect(screen.getByText('Desarrollo Backend')).toBeInTheDocument();
  });
});

describe('Cabecera del Roadmap operativo · fidelidad HTML v5.02', () => {
  it('muestra los tres contadores, explicación, leyenda exacta y HH reales de preventa', () => {
    const { container } = render(<PhaseRoadmap phaseRoadmap={{ ...phaseRoadmap, phaseCount: 2 }}
      operationalView operationalBlockCount={6} operationalTaskCount={19}
      operationalPresaleHours={18} toolbarActions={<button type="button">Planificar</button>} />);
    const counters = container.querySelector('[class*="summaryChips"]');
    expect(counters).toHaveTextContent('2 fases');
    expect(counters).toHaveTextContent('6 bloques de trabajo');
    expect(counters).toHaveTextContent('19 tareas');
    expect(screen.getByRole('button', { name: 'Planificar' })).toBeInTheDocument();
    expect(screen.getByText('Bloque de trabajo:').parentElement).toHaveTextContent(
      'Cada bloque cierra con una sola entrega; si se necesita otra entrega, se crea otro bloque.',
    );
    expect(screen.getByText('Avance del bloque')).toBeInTheDocument();
    expect(screen.getByText('Entrega planificada')).toBeInTheDocument();
    expect(screen.getByText('Entregada')).toBeInTheDocument();
    expect(screen.getByText('Entrega vencida')).toBeInTheDocument();
    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(screen.getByText(/Preventa: 18 HH de prospecto y cotización/)).toHaveTextContent(
      'Cuentan como HH consumidas, pero no forman parte del plan.',
    );
    expect(screen.queryByText('Entrega comprometida')).not.toBeInTheDocument();
    expect(screen.queryByText('Entrega realizada')).not.toBeInTheDocument();
  });

  it('no muestra guía ni preventa en el portal cliente y conserva su leyenda original', () => {
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap} operationalPresaleHours={18} />);
    expect(screen.queryByText('Bloque de trabajo:')).not.toBeInTheDocument();
    expect(screen.queryByText(/Preventa:/)).not.toBeInTheDocument();
    expect(screen.getByText('Entrega comprometida')).toBeInTheDocument();
  });

  it('no inventa mensaje de preventa cuando el backend no informa HH anteriores al inicio', () => {
    render(<PhaseRoadmap phaseRoadmap={phaseRoadmap} operationalView operationalPresaleHours={0} />);
    expect(screen.queryByText(/Preventa:/)).not.toBeInTheDocument();
  });
});
