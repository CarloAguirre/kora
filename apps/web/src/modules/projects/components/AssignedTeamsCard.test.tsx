import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AssignedTeamsCard } from './AssignedTeamsCard';

const project = { id: '0777e456-fd76-445e-83f1-afc25061c101', slug: 'demo' };
const teams = [{teamId:'0777e456-fd76-445e-83f1-afc25061c102',
  teamSlug:'desarrollo', teamName:'Desarrollo', leaderName:'Líder Kora',
  assignedHours:120, consumedHours:35}];

describe('Resumen de equipos: integración sin eliminar funcionalidad existente', () => {
  it('mantiene registro de horas y agrega acceso a gestión mediante editor existente', () => {
    const onViewHours=vi.fn();
    const onManageTeams=vi.fn();
    render(<MemoryRouter><AssignedTeamsCard
      project={project} teams={teams}
      onViewHours={onViewHours} onManageTeams={onManageTeams}
    /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button',{name:'Ver registro de horas'}));
    expect(onViewHours).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button',{name:'Gestionar equipos'}));
    expect(onManageTeams).toHaveBeenCalledOnce();
    expect(screen.getByText('Líder Kora')).toBeInTheDocument();
  });
  it('oculta gestión al usuario sin permisos, pero conserva el registro de horas', () => {
    render(<MemoryRouter><AssignedTeamsCard
      project={project} teams={teams} onViewHours={vi.fn()}
    /></MemoryRouter>);
    expect(screen.queryByRole('button',{name:'Gestionar equipos'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Ver registro de horas'})).toBeInTheDocument();
  });
});
