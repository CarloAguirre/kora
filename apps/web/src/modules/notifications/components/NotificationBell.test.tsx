import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';

const mocks = vi.hoisted(() => ({
  pending: [{
    projectId: '11111111-1111-4111-8111-111111111121',
    projectSlug: 'prueba-dev-2',
    projectName: 'Prueba Dev 2',
    clientName: 'Cliente',
    teamId: '22222222-2222-4222-8222-222222222222',
    teamSlug: 'ux-ui',
    teamName: 'UX-UI',
  }],
}));

vi.mock('../api/notifications.queries', () => ({
  useNotifications: () => ({ data: { items: [], unreadCount: 0 } }),
  useLeaderReminders: () => ({ data: {
    pendingApprovals: { entries: 0, hours: 0 },
    missingHourDays: [], projectsMissingData: [],
    teamsAwaitingStaffing: mocks.pending,
  } }),
  useMarkNotificationsRead: () => ({ mutate: vi.fn() }),
}));
function Location() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe('Campanita: equipos por dotar tras el traspaso', () => {
  it('muestra la alerta y abre la vista del equipo, no la ficha general del proyecto', () => {
    render(<MemoryRouter initialEntries={['/']}>
      <NotificationBell />
      <Routes>
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>);

    expect(screen.getByRole('button', { name: 'Notificaciones (1 pendientes)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
    expect(screen.getByText('1 equipo pendiente de asignar colaboradores')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', {
      name: 'Cliente — Prueba Dev 2 · UX-UI: asignar colaboradores',
    }));
    expect(screen.getByTestId('location')).toHaveTextContent('/proyectos/prueba-dev-2/equipos/ux-ui');
  });

  it('no deja el aviso visible cuando ya no hay equipos pendientes', () => {
    const before = mocks.pending;
    mocks.pending = [];
    try {
      render(<MemoryRouter><NotificationBell /></MemoryRouter>);
      fireEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
      expect(screen.getByText('No tienes notificaciones.')).toBeInTheDocument();
    } finally {
      mocks.pending = before;
    }
  });
});
