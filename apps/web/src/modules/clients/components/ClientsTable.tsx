import { Link } from 'react-router-dom';
import type { ClientSummary } from '@kora/contracts';
import styles from './ClientsTable.module.css';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { Button } from '@/shared/components/ui/Button';
import { ClientStatusBadge } from './ClientStatusBadge';
import { PencilIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { clientPath } from '@/app/router/paths';

export interface ClientsTableProps {
  clients: readonly ClientSummary[];
  loading: boolean;
  error: string | null;
  sort: SortState;
  onSortChange: (field: string) => void;
  onEdit: (client: ClientSummary) => void;
  onDelete: (client: ClientSummary) => void;
}

export function ClientsTable({
  clients,
  loading,
  error,
  sort,
  onSortChange,
  onEdit,
  onDelete,
}: ClientsTableProps) {
  const { can } = usePermissions();

  const columns: ReadonlyArray<Column<ClientSummary>> = [
    {
      key: 'companyName',
      header: 'Empresa',
      sortable: true,
      render: (client) => (
        <Link to={clientPath(client)} className={styles.identity}>
          <span className={styles.name}>{client.companyName}</span>
          <span className={styles.legalName}>{client.legalName}</span>
        </Link>
      ),
    },
    {
      key: 'taxId',
      header: 'RUT',
      sortable: true,
      render: (client) => client.taxId,
    },
    {
      key: 'commercialManager',
      header: 'Responsable comercial',
      render: (client) => client.commercialManager?.fullName ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'primaryContact',
      header: 'Contacto',
      render: (client) => client.primaryContactName ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'primaryContactEmail',
      header: 'Correo',
      render: (client) => client.primaryContactEmail ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'primaryContactPhone',
      header: 'Teléfono',
      render: (client) => client.primaryContactPhone ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'country',
      header: 'País',
      render: (client) => client.country?.name ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'industry',
      header: 'Giro',
      render: (client) => client.industry?.name ?? <span className={styles.empty}>—</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      sortable: true,
      render: (client) => <ClientStatusBadge status={client.status} />,
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '120px',
      render: (client) => (
        <div className={styles.actions}>
          {can('clients:manage') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(client)}
              aria-label={`Editar a ${client.companyName}`}
              title="Editar"
            >
              <PencilIcon size={16} />
            </Button>
          )}

          {can('clients:manage') && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(client)}
              aria-label={`Dar de baja a ${client.companyName}`}
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
      caption="Listado de clientes"
      columns={columns}
      items={clients}
      getRowKey={(client) => client.id}
      loading={loading}
      error={error}
      sort={sort}
      onSortChange={onSortChange}
      emptyMessage="No hay clientes que coincidan con los filtros aplicados."
    />
  );
}
