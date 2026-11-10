import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from './Sidebar';

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { role: 'admin', permissions: ['projects:manage'] } }),
}));

vi.mock('@/modules/auth/hooks/usePermissions', () => ({
  usePermissions: () => ({
    can: () => true,
    canAny: () => true,
    canAll: () => true,
  }),
}));

describe('Sidebar de Kora', () => {
  it('no muestra acceso directo a Calculadora aunque el usuario sea administrador', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Sidebar open onNavigate={vi.fn()} />
      </MemoryRouter>,
    );

    const navigation = screen.getByRole('navigation');
    expect(within(navigation).queryByRole('link', { name: 'Calculadora' }))
      .not.toBeInTheDocument();
    expect(within(navigation).getByRole('link', { name: 'Proyectos' }))
      .toHaveAttribute('href', '/proyectos');
    expect(within(navigation).getByRole('link', { name: 'Dashboard' }))
      .toHaveAttribute('href', '/dashboard');
  });
});
