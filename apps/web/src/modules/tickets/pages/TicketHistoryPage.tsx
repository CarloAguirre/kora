import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TICKET_STATUSES,
  TICKET_STATUS_LABELS,
  type ListTicketsQuery,
  type TicketSortField,
  type TicketStatus,
  type TicketSummary,
} from '@kora/contracts';
import styles from './TicketHistoryPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { TextField } from '@/shared/components/ui/TextField';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { DownloadIcon, EyeIcon, SearchIcon, SparklesIcon, AlertIcon } from '@/shared/components/icons/Icons';
import { TicketStatusBadge } from '../components/TicketStatusBadge';
import { TicketPriorityBadge } from '../components/TicketPriorityBadge';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { useTicketsList } from '../api/tickets.queries';
import { ticketsApi } from '../api/tickets.api';
import { exportTicketHistory } from '../lib/ticket-history-export';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDate = (value: string) => new Date(value).toLocaleDateString('es-CL');

/**
 * Listado histórico de tickets — réplica de `HistorialTickets/index.tsx` (v1):
 * a diferencia del tablero (`TicketsListPage`), acá se ven TODOS los tickets
 * sin importar su estado (incluido "Cerrado", que sale del tablero). Se llega
 * desde el botón "Ver Historial de Tickets" del tablero, igual que en la v1.
 */
export function TicketHistoryPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [search, setSearch] = useState('');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [status, setStatus] = useState<TicketStatus | ''>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<{ field: TicketSortField; direction: 'asc' | 'desc' }>({
    field: 'createdAt',
    direction: 'desc',
  });
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' });
  const { data: users } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });

  const query: Partial<ListTicketsQuery> = {
    page,
    pageSize,
    search: search || undefined,
    clientId: clientIds.length > 0 ? clientIds : undefined,
    assigneeUserId: assigneeUserIds.length > 0 ? assigneeUserIds : undefined,
    status: status || undefined,
    sortField: sort.field,
    sortDirection: sort.direction,
  };

  const { data, isLoading, error } = useTicketsList(query);

  const toggleSort = (field: string) => {
    setSort((current) =>
      current.field === field
        ? { field: current.field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field: field as TicketSortField, direction: 'asc' },
    );
    setPage(1);
  };

  const handleExport = async () => {
    setExportError(null);
    setExporting(true);
    try {
      // La API limita pageSize a 200 (ver paginationQuerySchema) para que
      // nadie pida la tabla entera de un tirón — el export sí la necesita
      // entera, así que pagina hasta juntar `total` filas en vez de asumir
      // que todo cabe en una página.
      const EXPORT_PAGE_SIZE = 200;
      const first = await ticketsApi.list({ ...query, page: 1, pageSize: EXPORT_PAGE_SIZE });
      const rows = [...first.items];
      const pageCount = Math.ceil(first.total / EXPORT_PAGE_SIZE);
      for (let currentPage = 2; currentPage <= pageCount; currentPage += 1) {
        const next = await ticketsApi.list({ ...query, page: currentPage, pageSize: EXPORT_PAGE_SIZE });
        rows.push(...next.items);
      }
      exportTicketHistory(rows);
    } catch (exportErr) {
      setExportError(exportErr instanceof ApiRequestError ? exportErr.message : 'No se pudo generar el Excel.');
    } finally {
      setExporting(false);
    }
  };

  const columns: ReadonlyArray<Column<TicketSummary>> = [
    {
      key: 'code',
      header: 'Cod. Ticket',
      render: (ticket) => (
        <span className={styles.codeCell}>
          {ticket.serviceType === 'improvement' ? <SparklesIcon size={16} /> : <AlertIcon size={16} />}
          {ticket.code ?? '—'}
        </span>
      ),
    },
    { key: 'title', header: 'Título', render: (ticket) => ticket.title },
    { key: 'assignee', header: 'Responsable', render: (ticket) => ticket.assignee?.fullName ?? 'Sin asignar' },
    { key: 'description', header: 'Incidente', render: (ticket) => ticket.description ?? '—' },
    { key: 'resolution', header: 'Solución', render: (ticket) => ticket.resolution ?? '—' },
    { key: 'client', header: 'Cliente', render: (ticket) => ticket.client?.companyName ?? '—' },
    { key: 'project', header: 'Proyecto Soporte', render: (ticket) => ticket.project?.name ?? '—' },
    { key: 'supportLeaderInitials', header: 'Líder Soporte', render: (ticket) => ticket.supportLeaderInitials ?? '—' },
    { key: 'developmentProject', header: 'Proyecto Desarrollo', render: (ticket) => ticket.developmentProject?.name ?? '—' },
    { key: 'status', header: 'Estado', sortable: true, render: (ticket) => <TicketStatusBadge status={ticket.status} /> },
    { key: 'priority', header: 'Prioridad', sortable: true, render: (ticket) => <TicketPriorityBadge priority={ticket.priority} /> },
    { key: 'createdAt', header: 'F. Reporte', sortable: true, render: (ticket) => formatDate(ticket.createdAt) },
    { key: 'estimatedHours', header: 'HH Estimadas', align: 'right', render: (ticket) => `${ticket.estimatedHours ?? '—'}` },
    { key: 'usedHours', header: 'HH Utilizadas', align: 'right', render: (ticket) => `${ticket.usedHours}` },
    {
      key: 'action',
      header: 'Acción',
      align: 'right',
      render: (ticket) => (
        <Button variant="ghost" size="icon" aria-label={`Ver ${ticket.code ?? ticket.title}`} onClick={() => setOpenTicketId(ticket.id)}>
          <EyeIcon size={20} />
        </Button>
      ),
    },
  ];

  return (
    <DashboardLayout title="Tickets">
      <div className={styles.page}>
        <Button variant="tertiary" size="sm" className={styles.backButton} onClick={() => void navigate('/tickets')}>
          ← Volver a tickets
        </Button>

        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>Historial de tickets</h2>
            <p className={styles.subtitle}>
              {data ? `${data.total} ticket${data.total === 1 ? '' : 's'} registrados` : ' '}
            </p>
          </div>
          {can('tickets:manage') && (
            <Button
              iconLeft={<DownloadIcon size={18} />}
              loading={exporting}
              loadingText="Generando…"
              onClick={() => void handleExport()}
            >
              Descargar Excel
            </Button>
          )}
        </div>

        {exportError && (
          <p className={styles.exportError} role="alert">
            {exportError}
          </p>
        )}

        <Card>
          <div className={styles.filters}>
            <TextField
              className={styles.search}
              label="Buscar"
              type="search"
              placeholder="Buscar por código o título"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              iconLeft={<SearchIcon size={16} />}
            />
            <MultiSelect
              className={styles.filter}
              label="Cliente"
              placeholder="Todos"
              searchPlaceholder="Buscar cliente"
              options={(clients?.items ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
              value={clientIds}
              onChange={(next) => {
                setClientIds(next);
                setPage(1);
              }}
            />
            <MultiSelect
              className={styles.filter}
              label="Responsable"
              placeholder="Todos"
              searchPlaceholder="Buscar responsable"
              options={(users?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
              value={assigneeUserIds}
              onChange={(next) => {
                setAssigneeUserIds(next);
                setPage(1);
              }}
            />
            <Select
              className={styles.filter}
              label="Estado"
              placeholder="Todos"
              options={TICKET_STATUSES.map((value) => ({ value, label: TICKET_STATUS_LABELS[value] }))}
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as TicketStatus | '');
                setPage(1);
              }}
            />
          </div>

          <div className={styles.tableSection}>
            <DataTable
              columns={columns}
              items={data?.items ?? []}
              getRowKey={(ticket) => ticket.id}
              loading={isLoading}
              error={
                error
                  ? error instanceof ApiRequestError
                    ? error.message
                    : 'No se pudo cargar el historial de tickets.'
                  : null
              }
              emptyMessage="No hay tickets que coincidan con la búsqueda."
              sort={sort}
              onSortChange={toggleSort}
              topScrollbar
            />

            {data && (
              <Pagination
                page={page}
                pageCount={data.pageCount}
                total={data.total}
                pageSize={data.pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            )}
          </div>
        </Card>
      </div>

      {openTicketId && <TicketDetailModal ticketId={openTicketId} onClose={() => setOpenTicketId(null)} />}
    </DashboardLayout>
  );
}
