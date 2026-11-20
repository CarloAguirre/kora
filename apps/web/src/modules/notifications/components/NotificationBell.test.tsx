import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import type { Notification } from '@kora/contracts';

const mocks = vi.hoisted(() => ({
  items: [] as Notification[],
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
  useNotifications: () => ({ data: { items: mocks.items, unreadCount: mocks.items.length } }),
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


describe('Campanita: revisión de tareas y devoluciones', () => {
  it('abre el proyecto para revisar la tarea que terminó el colaborador', () => {
    mocks.pending = [];
    mocks.items = [{
      id: '11111111-1111-4111-8111-111111111111',
      type: 'task_review_requested', title: 'Tarea completada pendiente de aprobación',
      readAt: null, createdAt: '2026-11-04T12:00:00.000Z',
      data: {
        projectId: '22222222-2222-4222-8222-222222222222',
        projectSlug: 'prueba-dev-2', projectName: 'Prueba Dev 2',
        moduleId: '33333333-3333-4333-8333-333333333333',
        taskId: '44444444-4444-4444-8444-444444444444',
        taskName: 'Mejoras en bitácora', assigneeName: 'Claudio Flores',
        reason: null,
      },
    }];
    try {
      render(<MemoryRouter><NotificationBell /><Location /></MemoryRouter>);
      fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
      expect(screen.getByText('Tarea completada pendiente de aprobación')).toBeInTheDocument();
      expect(screen.getByText('Completada por Claudio Flores. Requiere aprobación.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('link', { name: 'Prueba Dev 2 · Mejoras en bitácora' }));
      expect(screen.getByTestId('location')).toHaveTextContent('/proyectos/prueba-dev-2');
    } finally {
      mocks.items = [];
      mocks.pending = [{
        projectId: '11111111-1111-4111-8111-111111111121',
        projectSlug: 'prueba-dev-2', projectName: 'Prueba Dev 2', clientName: 'Cliente',
        teamId: '22222222-2222-4222-8222-222222222222',
        teamSlug: 'ux-ui', teamName: 'UX-UI',
      }];
    }
  });

  it('muestra el motivo de devolución al colaborador', () => {
    const before = mocks.pending;
    mocks.pending = [];
    mocks.items = [{
      id: '11111111-1111-4111-8111-111111111111',
      type: 'task_returned', title: 'Tarea devuelta para correcciones',
      readAt: null, createdAt: '2026-11-04T12:00:00.000Z',
      data: {
        projectId: '22222222-2222-4222-8222-222222222222',
        projectSlug: 'prueba-dev-2', projectName: 'Prueba Dev 2',
        moduleId: '33333333-3333-4333-8333-333333333333',
        taskId: '44444444-4444-4444-8444-444444444444',
        taskName: 'Mejoras en bitácora', assigneeName: 'Claudio Flores',
        reason: 'Corregir validación de fechas',
      },
    }];
    try {
      render(<MemoryRouter><NotificationBell /></MemoryRouter>);
      fireEvent.click(screen.getByRole('button', { name: /Notificaciones/ }));
      expect(screen.getByText('Motivo de devolución: Corregir validación de fechas'))
        .toBeInTheDocument();
    } finally {
      mocks.pending = before;
      mocks.items = [];
    }
  });
});
