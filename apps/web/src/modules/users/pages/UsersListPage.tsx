import { useMemo, useState } from 'react';
import type { UserStatus, UserSummary } from '@kora/contracts';
import styles from './UsersListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Tabs, type TabItem } from '@/shared/components/ui/Tabs';
import { useToast } from '@/shared/components/ui/Toast';
import { PlusIcon } from '@/shared/components/icons/Icons';
import { UsersFilters } from '../components/UsersFilters';
import { UsersTable } from '../components/UsersTable';
import { UserFormDialog } from '../components/UserFormDialog';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { useUsersListState } from '../hooks/useUsersListState';
import { useChangeUserStatus, useDeleteUser, useGrantUserAccess, useUsersList } from '../api/users.queries';
import { useTeamsList } from '@/modules/teams/api/teams.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';
import { CapacityReportTable } from '@/modules/hours/components/CapacityReportTable';
import { AvailabilityGrid } from '@/modules/hours/components/AvailabilityGrid';
import { OvertimeReportSection } from '@/modules/dashboard/components/OvertimeReportSection';

type AdminTab = 'usuarios' | 'capacity' | 'registro-horas' | 'horas-extras';

/**
 * Administración de usuarios.
 *
 * Compara con la v1: la misma pantalla ocupaba 2.554 líneas en un único
 * archivo, con la tabla, los filtros, los tres modales, las llamadas a
 * Supabase, el manejo de errores de aprovisionamiento y una docena de `useState`
 * conviviendo. Aquí la página solo decide QUÉ se muestra y QUIÉN responde a
 * cada acción; el cómo está repartido en piezas que se prueban por separado.
 *
 * Si mañana se añade una acción, se añade un componente. La página crece una
 * línea, no cien.
 */

type DialogState =
  | { kind: 'none' }
  | { kind: 'form'; user: UserSummary | null }
  | { kind: 'grantAccess'; user: UserSummary }
  | { kind: 'disable'; user: UserSummary }
  | { kind: 'delete'; user: UserSummary };

const BASE_TABS: readonly TabItem[] = [{ id: 'usuarios', label: 'Usuarios' }];
const HOURS_REPORT_TABS: readonly TabItem[] = [
  { id: 'capacity', label: 'Capacity' },
  { id: 'registro-horas', label: 'Registro de Horas' },
  { id: 'horas-extras', label: 'Horas Extras' },
];

export function UsersListPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<AdminTab>('usuarios');
  const { filters, query, sort, page, setFilters, setPage, setPageSize, toggleSort } = useUsersListState();
  const { data, isLoading, error } = useUsersList(query);
  const { data: teamsData } = useTeamsList({ page: 1, pageSize: 200, sortField: 'name', isActive: true });

  const tabs = useMemo(
    () => (can('hours:read_all') ? [...BASE_TABS, ...HOURS_REPORT_TABS] : BASE_TABS),
    [can],
  );

  const grantAccess = useGrantUserAccess();
  const deleteUser = useDeleteUser();
  const changeStatus = useChangeUserStatus();

  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const closeDialog = () => setDialog({ kind: 'none' });

  // Qué fila tiene el cambio de estado en vuelo: mientras dure, su interruptor
  // queda inerte. Con `changeStatus.isPending` a secas se apagarían todos.
  const [statusPendingUserId, setStatusPendingUserId] = useState<string | null>(null);

  const applyStatus = async (user: UserSummary, status: UserStatus) => {
    setStatusPendingUserId(user.id);
    try {
      await changeStatus.mutateAsync({ userId: user.id, input: { status } });
      toast.success(
        status === 'active'
          ? `${user.fullName} quedó habilitado.`
          : `${user.fullName} quedó deshabilitado y se cerraron sus sesiones.`,
      );
    } finally {
      setStatusPendingUserId(null);
    }
  };

  /**
   * Habilitar se aplica de inmediato; deshabilitar pasa por confirmación.
   * No es simetría por gusto: deshabilitar echa a la persona de sus sesiones
   * abiertas y le manda un correo, y un clic de más en la tabla no debería
   * bastar para eso. Volver a habilitar no rompe nada.
   */
  const handleToggleStatus = (user: UserSummary, enabled: boolean) => {
    if (!enabled) {
      setDialog({ kind: 'disable', user });
      return;
    }

    void applyStatus(user, 'active').catch((error) => {
      toast.error(
        error instanceof ApiRequestError ? error.message : 'No se pudo habilitar al usuario.',
      );
    });
  };

  const handleDisable = async () => {
    if (dialog.kind !== 'disable') return;
    await applyStatus(dialog.user, 'disabled');
  };

  const handleGrantAccess = async () => {
    if (dialog.kind !== 'grantAccess') return;

    const result = await grantAccess.mutateAsync(dialog.user.id);
    toast[result.invitationSent ? 'success' : 'error'](
      result.invitationSent
        ? `Se envió la invitación a ${dialog.user.email}.`
        : 'El acceso se habilitó, pero no se pudo enviar el correo. Vuelve a intentarlo.',
    );
  };

  const handleDelete = async () => {
    if (dialog.kind !== 'delete') return;

    await deleteUser.mutateAsync(dialog.user.id);
    toast.success(`${dialog.user.fullName} fue dado de baja.`);
  };

  return (
    <DashboardLayout title="Administración">
      <div className={styles.page}>
        {/* Contador y alta viven en la MISMA fila que las pestañas, alineados a
            su centro — mismo patrón que el `.topRow` del Dashboard. El `<div/>`
            vacío sostiene el lado izquierdo cuando no hay pestañas que mostrar,
            para que el botón no se desplace a la izquierda. */}
        <div className={styles.topRow}>
          {tabs.length > 1 ? (
            <Tabs tabs={tabs} activeId={activeTab} onSelect={(id) => setActiveTab(id as AdminTab)} />
          ) : (
            <div />
          )}

          {activeTab === 'usuarios' && (
            <div className={styles.actions}>
              <p className={styles.subtitle}>
                {data ? `${data.total} usuario${data.total === 1 ? '' : 's'} registrados` : ' '}
              </p>

              {can('users:create') && (
                <Button
                  onClick={() => setDialog({ kind: 'form', user: null })}
                  iconLeft={<PlusIcon size={18} />}
                >
                  Nuevo usuario
                </Button>
              )}
            </div>
          )}
        </div>

        {activeTab === 'usuarios' && (
          <Card>
            <UsersFilters value={filters} onChange={setFilters} />

            <div className={styles.tableSection}>
              <UsersTable
                users={data?.items ?? []}
                loading={isLoading}
                error={
                  error
                    ? error instanceof ApiRequestError
                      ? error.message
                      : 'No se pudo cargar el listado de usuarios.'
                    : null
                }
                sort={sort}
                onSortChange={toggleSort}
                onEdit={(user) => setDialog({ kind: 'form', user })}
                onGrantAccess={(user) => setDialog({ kind: 'grantAccess', user })}
                onDelete={(user) => setDialog({ kind: 'delete', user })}
                onToggleStatus={handleToggleStatus}
                statusPendingUserId={statusPendingUserId}
              />

              {data && (
                <Pagination
                  page={page}
                  pageCount={data.pageCount}
                  total={data.total}
                  pageSize={data.pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={setPageSize}
                />
              )}
            </div>
          </Card>
        )}

        {activeTab === 'capacity' && (
          <Card>
            <CapacityReportTable />
          </Card>
        )}

        {activeTab === 'registro-horas' && (
          <Card>
            <AvailabilityGrid />
          </Card>
        )}

        {/* La sección ya trae su propia Card. */}
        {activeTab === 'horas-extras' && <OvertimeReportSection />}
      </div>

      <UserFormDialog
        open={dialog.kind === 'form'}
        user={dialog.kind === 'form' ? dialog.user : null}
        teams={teamsData?.items ?? []}
        onClose={closeDialog}
        onSuccess={(message) => toast.success(message)}
        onDelete={(user) => setDialog({ kind: 'delete', user })}
      />

      <ConfirmActionDialog
        open={dialog.kind === 'grantAccess'}
        title={
          dialog.kind === 'grantAccess' && dialog.user.hasAccountAccess
            ? 'Reenviar invitación'
            : 'Dar acceso al sistema'
        }
        description={
          dialog.kind === 'grantAccess'
            ? `Se enviará a ${dialog.user.email} un enlace para definir su contraseña. El enlace caduca en 72 horas e invalida cualquier invitación anterior.`
            : ''
        }
        confirmLabel="Enviar invitación"
        onConfirm={handleGrantAccess}
        onClose={closeDialog}
      />

      <ConfirmActionDialog
        open={dialog.kind === 'disable'}
        title="Deshabilitar al usuario"
        description={
          dialog.kind === 'disable'
            ? `${dialog.user.fullName} dejará de poder entrar y se cerrarán sus sesiones abiertas al instante. Seguirá en los listados y podrás volver a habilitarlo cuando quieras.`
            : ''
        }
        confirmLabel="Deshabilitar"
        destructive
        onConfirm={handleDisable}
        onClose={closeDialog}
      />

      <ConfirmActionDialog
        open={dialog.kind === 'delete'}
        title="Dar de baja al usuario"
        description={
          dialog.kind === 'delete'
            ? `${dialog.user.fullName} perderá el acceso y dejará de aparecer en los listados. Su historial de horas, tickets y proyectos se conserva íntegro.`
            : ''
        }
        confirmLabel="Dar de baja"
        destructive
        onConfirm={handleDelete}
        onClose={closeDialog}
      />
    </DashboardLayout>
  );
}
