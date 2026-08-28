import type { UserSummary } from '@kora/contracts';
import styles from './UsersTable.module.css';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { Button } from '@/shared/components/ui/Button';
import { UserStatusBadge } from './UserStatusBadge';
import { UserRoleBadge } from './UserRoleBadge';
import { KeyIcon, PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';

/**
 * Tabla de usuarios.
 *
 * Define columnas y acciones; el renderizado, el orden, la carga y los estados
 * vacíos los pone `DataTable`. Por eso este archivo cabe en una pantalla, y no
 * en las 2.554 líneas que ocupaba la administración de usuarios en la v1.
 *
 * Cada acción se muestra solo si la persona tiene el permiso correspondiente —
 * el servidor lo vuelve a comprobar de todos modos.
 */

export interface UsersTableProps {
  users: readonly UserSummary[];
  loading: boolean;
  error: string | null;
  sort: SortState;
  onSortChange: (field: string) => void;
  onEdit: (user: UserSummary) => void;
  onGrantAccess: (user: UserSummary) => void;
  onDelete: (user: UserSummary) => void;
}

export function UsersTable({
  users,
  loading,
  error,
  sort,
  onSortChange,
  onEdit,
  onGrantAccess,
  onDelete,
}: UsersTableProps) {
  const { can } = usePermissions();

  const columns: ReadonlyArray<Column<UserSummary>> = [
    {
      key: 'firstName',
      header: 'Nombre',
      sortable: true,
      render: (user) => (
        <div className={styles.identity}>
          <span className={styles.name}>{user.fullName}</span>
          <span className={styles.email}>{user.email}</span>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Rol',
      sortable: true,
      render: (user) => <UserRoleBadge role={user.role} leaderProfile={user.leaderProfile} />,
    },
    {
      key: 'team',
      header: 'Equipo',
      sortable: true,
      render: (user) => user.team?.name ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (user) => (
        <div className={styles.statusCell}>
          <UserStatusBadge status={user.status} />
          {/* Distinguir "no tiene cuenta" de "está deshabilitado" es esencial
              aquí: la mayoría de las fichas migradas nunca tuvo acceso. */}
          {!user.hasAccountAccess && <span className={styles.noAccess}>Sin acceso</span>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '160px',
      render: (user) => (
        <div className={styles.actions}>
          {can('users:update') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(user)}
              aria-label={`Editar a ${user.fullName}`}
              title="Editar"
            >
              <PencilIcon size={16} />
            </Button>
          )}

          {can('users:reset_password') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onGrantAccess(user)}
              aria-label={
                user.hasAccountAccess
                  ? `Reenviar invitación a ${user.fullName}`
                  : `Dar acceso a ${user.fullName}`
              }
              title={user.hasAccountAccess ? 'Reenviar invitación' : 'Dar acceso'}
            >
              <KeyIcon size={16} />
            </Button>
          )}

          {can('users:delete') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(user)}
              aria-label={`Dar de baja a ${user.fullName}`}
              title="Dar de baja"
              className={styles.dangerAction}
            >
              <TrashIcon size={16} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      caption="Listado de usuarios del sistema"
      columns={columns}
      items={users}
      getRowKey={(user) => user.id}
      loading={loading}
      error={error}
      sort={sort}
      onSortChange={onSortChange}
      emptyMessage="No hay usuarios que coincidan con los filtros aplicados."
    />
  );
}
