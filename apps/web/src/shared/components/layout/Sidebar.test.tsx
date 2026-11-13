import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      role: 'admin',
      permissions: ['admin:legacy_import', 'users:read', 'projects:manage', 'projects:read', 'projects:read_own_client'],
    },
  }),
}));

describe('Sidebar', () => {
  it('hides data import even with permission and preserves administration navigation', () => {
    render(
      <MemoryRouter>
        <Sidebar open onNavigate={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link', { name: 'Importar datos' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Administración' })).toHaveAttribute('href', '/usuarios');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
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
