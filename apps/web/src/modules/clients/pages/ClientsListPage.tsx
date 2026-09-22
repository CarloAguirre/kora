import { useState } from 'react';
import type { ClientSummary } from '@kora/contracts';
import styles from './ClientsListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Pagination } from '@/shared/components/ui/Pagination';
import { SegmentedControl } from '@/shared/components/ui/SegmentedControl';
import { useToast } from '@/shared/components/ui/Toast';
import { PlusIcon } from '@/shared/components/icons/Icons';
import { ClientsFilters } from '../components/ClientsFilters';
import { ClientsTable } from '../components/ClientsTable';
import { ClientsStatsCards } from '../components/ClientsStatsCards';
import { ClientFormDialog } from '../components/ClientFormDialog';
import { DeactivateClientDialog } from '../components/DeactivateClientDialog';
import { useClientsListState, type ClientsStatusTab } from '../hooks/useClientsListState';
import { useClientsList, useClientsStats } from '../api/clients.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';

type DialogState =
  | { kind: 'none' }
  | { kind: 'form'; clientId: string | null }
  | { kind: 'deactivate'; client: ClientSummary };

/**
 * Administración de clientes: primer módulo del camino crítico después de
 * Identidad. Sigue exactamente el mismo patrón que `UsersListPage` — la página
 * compone, los componentes hacen el trabajo — para que el siguiente módulo
 * (Equipos) tenga una plantilla probada de la que partir.
 */
export function ClientsListPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const { filters, tab, query, sort, page, setFilters, setTab, setPage, toggleSort } = useClientsListState();
  const { data, isLoading, error } = useClientsList(query);
  const { data: stats, isLoading: statsLoading } = useClientsStats();

  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
  const closeDialog = () => setDialog({ kind: 'none' });

  const statusOptions = [
    { value: 'all', label: `Todos${stats ? ` (${stats.totalCount})` : ''}` },
    { value: 'active', label: `Activos${stats ? ` (${stats.activeCount})` : ''}` },
    { value: 'inactive', label: `Inactivos${stats ? ` (${stats.inactiveCount})` : ''}` },
  ];

  return (
    <DashboardLayout title="Clientes">
      <div className={styles.page}>
        <header className={styles.header}>
          <p className={styles.subtitle}>
            {data ? `${data.total} cliente${data.total === 1 ? '' : 's'} registrados` : ' '}
          </p>

          {can('clients:manage') && (
            <Button
              onClick={() => setDialog({ kind: 'form', clientId: null })}
              iconLeft={<PlusIcon size={18} />}
            >
              Nuevo cliente
            </Button>
          )}
        </header>

        <ClientsStatsCards stats={stats} loading={statsLoading} />

        <Card>
          <div className={styles.filterRow}>
            <SegmentedControl
              options={statusOptions}
              value={tab}
              onChange={(value) => setTab(value as ClientsStatusTab)}
              aria-label="Filtrar clientes por estado"
            />
            <ClientsFilters value={filters} onChange={setFilters} />
          </div>

          <div className={styles.tableSection}>
            <ClientsTable
              clients={data?.items ?? []}
              loading={isLoading}
              error={
                error
                  ? error instanceof ApiRequestError
                    ? error.message
                    : 'No se pudo cargar el listado de clientes.'
                  : null
              }
              sort={sort}
              onSortChange={toggleSort}
              onEdit={(client) => setDialog({ kind: 'form', clientId: client.id })}
              onDelete={(client) => setDialog({ kind: 'deactivate', client })}
            />

            {data && (
              <Pagination
                page={page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={data.pageSize}
                onPageChange={setPage}
              />
            )}
          </div>
        </Card>
      </div>

      <ClientFormDialog
        open={dialog.kind === 'form'}
        clientId={dialog.kind === 'form' ? dialog.clientId : null}
        onClose={closeDialog}
        onSuccess={(message) => toast.success(message)}
      />

      <DeactivateClientDialog
        open={dialog.kind === 'deactivate'}
        client={dialog.kind === 'deactivate' ? dialog.client : null}
        onClose={closeDialog}
        onSuccess={(message) => toast.success(message)}
      />
    </DashboardLayout>
  );
}
