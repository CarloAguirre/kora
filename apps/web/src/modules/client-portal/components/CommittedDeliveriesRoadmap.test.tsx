import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommittedDeliveriesRoadmap } from './CommittedDeliveriesRoadmap';

const fixtures = [
  { id: 'entrega-a', name: 'Modelo comercial', phase: 'Planificación',
    team: 'Desarrollo', estimatedDate: '2026-10-20', status: 'approved' as const, received: true },
  { id: 'entrega-b', name: 'Tablero de seguimiento', phase: 'Planificación',
    team: 'QA', estimatedDate: '2026-11-04', status: 'approved' as const, received: false },
  { id: 'entrega-c', name: 'Marcha blanca', phase: 'Cierre',
    team: null, estimatedDate: '2026-11-30', status: 'planned' as const, received: false },
];

describe('CommittedDeliveriesRoadmap — vista externa', () => {
  it('muestra los compromisos reales con fecha y estado de recepción', () => {
    render(<CommittedDeliveriesRoadmap deliveries={fixtures} onReview={vi.fn()} />);
    expect(screen.getByText('3 entregas comprometidas')).toBeInTheDocument();
    expect(screen.getByText('1 esperando OK')).toBeInTheDocument();
    expect(screen.getByText('1 recibidas')).toBeInTheDocument();
    expect(screen.getAllByText('Modelo comercial')).toHaveLength(2);
    expect(screen.getAllByText('Tablero de seguimiento')).toHaveLength(2);
    expect(screen.getAllByText('Marcha blanca')).toHaveLength(2);
    expect(screen.queryByText('Tareas operativas')).not.toBeInTheDocument();
  });

  it('solo permite dar OK a una entrega aprobada internamente y aún no recibida', () => {
    const review = vi.fn();
    render(<CommittedDeliveriesRoadmap deliveries={fixtures} onReview={review} />);
    expect(screen.getAllByRole('button', { name: 'Dar OK' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dar OK' }));
    expect(review).toHaveBeenCalledExactlyOnceWith('entrega-b');
  });

  it('sin entregas no inventa fases ni hitos', () => {
    render(<CommittedDeliveriesRoadmap deliveries={[]} onReview={vi.fn()}/>);
    expect(screen.getByText(/Todavía no existen entregas comprometidas/)).toBeInTheDocument();
    expect(screen.queryByText('FASE 1')).not.toBeInTheDocument();
  });
});
