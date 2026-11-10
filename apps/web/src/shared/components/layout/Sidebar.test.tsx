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
    // Kora tiene dos entradas con etiqueta «Proyectos» según permisos:
    // menú interno y portal de cliente. Verificar el href sin exigir unicidad.
    expect(within(navigation).getAllByRole('link', { name: 'Proyectos' })
      .some((link) => link.getAttribute('href') === '/proyectos')).toBe(true);
    expect(within(navigation).getByRole('link', { name: 'Dashboard' }))
      .toHaveAttribute('href', '/dashboard');
  });
});
