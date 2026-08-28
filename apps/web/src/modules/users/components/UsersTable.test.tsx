import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Permission, UserSummary } from '@kora/contracts';
import { UsersTable } from './UsersTable';
import { AuthContext, type AuthContextValue } from '@/modules/auth/context/AuthContext';

/**
 * Tests de la tabla de usuarios.
 *
 * Se prueba lo que ve y hace quien usa la aplicación —qué columnas aparecen,
 * qué acciones están disponibles según sus permisos— y no los detalles internos
 * del componente. Un test que comprueba nombres de clase o estado interno se
 * rompe al refactorizar aunque el comportamiento sea idéntico.
 */

function buildUser(overrides: Partial<UserSummary> = {}): UserSummary {
  return {
    id: 'user-1',
    email: 'ana.soto@kabeli.cl',
    firstName: 'Ana',
    lastName: 'Soto',
    fullName: 'Ana Soto',
    role: 'collaborator',
    status: 'active',
    team: { id: 'team-1', name: 'Desarrollo' },
    isCommercialManager: false,
    leaderProfile: null,
    hasAccountAccess: true,
    lastLoginAt: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function renderTable(
  users: UserSummary[],
  permissions: Permission[],
  props: Partial<Parameters<typeof UsersTable>[0]> = {},
) {
  const auth: AuthContextValue = {
    user: {
      id: 'actor',
      email: 'admin@kabeli.cl',
      firstName: 'Admin',
      lastName: 'Kora',
      fullName: 'Admin Kora',
      role: 'admin',
      status: 'active',
      permissions,
      teamId: null,
      leaderProfile: null,
      mustChangePassword: false,
    },
    status: 'authenticated',
    signIn: vi.fn(),
    signOut: vi.fn(),
    refreshUser: vi.fn(),
  };

  return render(
    <AuthContext.Provider value={auth}>
      <UsersTable
        users={users}
        loading={false}
        error={null}
        sort={{ field: 'firstName', direction: 'asc' }}
        onSortChange={vi.fn()}
        onEdit={vi.fn()}
        onGrantAccess={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </AuthContext.Provider>,
  );
}

const ALL_PERMISSIONS: Permission[] = [
  'users:read',
  'users:update',
  'users:delete',
  'users:reset_password',
];

describe('UsersTable', () => {
  it('muestra el nombre, el correo y el equipo de cada usuario', () => {
    renderTable([buildUser()], ALL_PERMISSIONS);

    expect(screen.getByText('Ana Soto')).toBeInTheDocument();
    expect(screen.getByText('ana.soto@kabeli.cl')).toBeInTheDocument();
    expect(screen.getByText('Desarrollo')).toBeInTheDocument();
  });

  it('distingue a quien no tiene cuenta de acceso', () => {
    // Es el caso mayoritario tras la migración: fichas de personal sin login.
    // Confundirlo con "deshabilitado" llevaría a un administrador a intentar
    // rehabilitar a alguien que en realidad nunca tuvo acceso.
    renderTable([buildUser({ hasAccountAccess: false })], ALL_PERMISSIONS);

    expect(screen.getByText('Habilitado')).toBeInTheDocument();
    expect(screen.getByText('Sin acceso')).toBeInTheDocument();
  });

  it('muestra el perfil derivado en lugar del rol genérico para un líder', () => {
    renderTable(
      [buildUser({ role: 'leader', leaderProfile: 'team_leader' })],
      ALL_PERMISSIONS,
    );

    expect(screen.getByText('Líder de equipo')).toBeInTheDocument();
  });

  it('oculta las acciones para las que no hay permiso', () => {
    renderTable([buildUser()], ['users:read']);

    expect(screen.queryByRole('button', { name: /Editar a Ana Soto/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Dar de baja a Ana Soto/ })).not.toBeInTheDocument();
  });

  it('ofrece "Dar acceso" a quien no lo tiene y "Reenviar invitación" a quien sí', () => {
    const { rerender } = renderTable([buildUser({ hasAccountAccess: false })], ALL_PERMISSIONS);
    expect(screen.getByRole('button', { name: /Dar acceso a Ana Soto/ })).toBeInTheDocument();

    rerender(
      <AuthContext.Provider
        value={{
          user: {
            id: 'actor',
            email: 'admin@kabeli.cl',
            firstName: 'Admin',
            lastName: 'Kora',
            fullName: 'Admin Kora',
            role: 'admin',
            status: 'active',
            permissions: ALL_PERMISSIONS,
            teamId: null,
            leaderProfile: null,
            mustChangePassword: false,
          },
          status: 'authenticated',
          signIn: vi.fn(),
          signOut: vi.fn(),
          refreshUser: vi.fn(),
        }}
      >
        <UsersTable
          users={[buildUser({ hasAccountAccess: true })]}
          loading={false}
          error={null}
          sort={{ field: 'firstName', direction: 'asc' }}
          onSortChange={vi.fn()}
          onEdit={vi.fn()}
          onGrantAccess={vi.fn()}
          onDelete={vi.fn()}
        />
      </AuthContext.Provider>,
    );

    expect(
      screen.getByRole('button', { name: /Reenviar invitación a Ana Soto/ }),
    ).toBeInTheDocument();
  });

  it('avisa cuando no hay resultados', () => {
    renderTable([], ALL_PERMISSIONS);

    expect(screen.getByText(/No hay usuarios que coincidan/)).toBeInTheDocument();
  });

  it('muestra el error del servidor en lugar de una tabla vacía', () => {
    renderTable([], ALL_PERMISSIONS, { error: 'El servidor no responde.' });

    expect(screen.getByText('El servidor no responde.')).toBeInTheDocument();
  });

  it('avisa a los lectores de pantalla de la columna ordenada', () => {
    renderTable([buildUser()], ALL_PERMISSIONS);

    const header = screen.getByRole('columnheader', { name: /Nombre/ });
    expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  it('pide ordenar al pulsar una cabecera ordenable', async () => {
    const onSortChange = vi.fn();
    renderTable([buildUser()], ALL_PERMISSIONS, { onSortChange });

    await userEvent.click(screen.getByRole('button', { name: 'Rol' }));

    expect(onSortChange).toHaveBeenCalledWith('role');
  });

  it('entrega el usuario correcto a la acción pulsada', async () => {
    const onEdit = vi.fn();
    const users = [buildUser(), buildUser({ id: 'user-2', fullName: 'Luis Pérez' })];
    renderTable(users, ALL_PERMISSIONS, { onEdit });

    await userEvent.click(screen.getByRole('button', { name: /Editar a Luis Pérez/ }));

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-2' }));
  });

  it('durante la carga no muestra el mensaje de vacío', () => {
    renderTable([], ALL_PERMISSIONS, { loading: true });

    expect(screen.queryByText(/No hay usuarios que coincidan/)).not.toBeInTheDocument();
  });

  it('muestra un guion cuando el usuario no tiene equipo', () => {
    renderTable([buildUser({ team: null })], ALL_PERMISSIONS);

    const row = screen.getByText('Ana Soto').closest('tr');
    expect(within(row as HTMLElement).getByText('—')).toBeInTheDocument();
  });
});
