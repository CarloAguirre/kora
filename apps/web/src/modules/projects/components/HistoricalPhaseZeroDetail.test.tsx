import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectDetail } from '@kora/contracts';
import { HistoricalPhaseZeroDetail } from './HistoricalPhaseZeroDetail';

const id = (n: number) => '0777e456-fd76-445e-83f1-' + String(n).padStart(12, '0');
const project = {
  phaseZeroHours: 548.5, phaseZeroEntriesTruncated: false,
  phaseZeroEntries: [
    { id: id(1), date: '2026-11-10', recordedAt: '2026-11-10T12:00:00Z',
      userName: 'Ana Soto', activity: 'Reunión de levantamiento', description: 'Alcances',
      taskName: null, hours: 8, status: 'approved',
      teamId: id(10), teamName: 'Desarrollo', teamAttribution: 'current_membership' },
    { id: id(2), date: '2026-11-11', recordedAt: '2026-11-11T12:00:00Z',
      userName: 'Ana Soto', activity: 'Validación', description: '',
      taskName: null, hours: 4, status: 'pending',
      teamId: id(10), teamName: 'Desarrollo', teamAttribution: 'current_membership' },
    { id: id(3), date: '2026-11-09', recordedAt: '2026-11-09T12:00:00Z',
      userName: 'Pedro Solís', activity: 'Diseño', description: '',
      taskName: 'Prototipo Figma', hours: 2, status: 'approved',
      teamId: id(11), teamName: 'UX-UI', teamAttribution: 'explicit' },
    { id: id(4), date: '2026-11-08', recordedAt: '2026-11-08T12:00:00Z',
      userName: 'Alguien', activity: 'Prospección', description: '',
      taskName: null, hours: 1, status: 'rejected',
      teamId: null, teamName: null, teamAttribution: 'unassigned' },
  ],
} as unknown as ProjectDetail;
describe('Fase 0 histórica: trazabilidad real por equipo', () => {
  it('conserva las HH de foto, agrupa registros sin contarlos como nuevos bloques', () => {
    render(<HistoricalPhaseZeroDetail project={project} />);
    const phase = screen.getByRole('region', { name: 'Fase 0 · Prospecto y levantamiento' });
    expect(phase).toHaveTextContent('548,5 HH consumidas');
    expect(phase).toHaveTextContent('Aprobadas: 10 HH');
    expect(phase).toHaveTextContent('Pendientes: 4 HH');
    expect(within(phase).getAllByText(/registros/).length).toBeGreaterThan(0);
    expect(phase).toHaveTextContent('Equipo actual (referencial)');
    expect(phase).toHaveTextContent('Sin equipo identificable');
    fireEvent.click(within(phase).getByText('Desarrollo'));
    expect(phase).toHaveTextContent('Reunión de levantamiento');
    expect(phase).toHaveTextContent('Pendiente');
  });
  it('no inventa tareas ni equipos cuando faltan vínculos', () => {
    render(<HistoricalPhaseZeroDetail project={{ ...project,
      phaseZeroEntries: project.phaseZeroEntries.filter((entry) => entry.teamId === null),
    }} />);
    expect(screen.getByText('Sin equipo identificable')).toBeInTheDocument();
    expect(screen.queryByText('Equipo actual (referencial)')).not.toBeInTheDocument();
  });
});