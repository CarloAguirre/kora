import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Sidebar } from './Sidebar';

vi.mock('@/modules/auth/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      role: 'admin',
      permissions: ['admin:legacy_import', 'users:read'],
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
  });
});
