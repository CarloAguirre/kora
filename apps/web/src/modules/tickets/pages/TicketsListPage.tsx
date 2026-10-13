import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TICKET_STATUSES, type TicketStatus, type TicketSummary } from '@kora/contracts';
import styles from './TicketsListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { TextField } from '@/shared/components/ui/TextField';
import { AlertIcon, CalendarIcon, ClockIcon, PlusIcon, SearchIcon, SparklesIcon, UserIcon } from '@/shared/components/icons/Icons';
import { TicketPriorityBadge } from '../components/TicketPriorityBadge';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { NewTicketDialog } from '../components/NewTicketDialog';
import { useChangeTicketStatus, useTicketLinkableClients, useTicketsList } from '../api/tickets.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';

/** Sólo se muestran en el tablero — "Cerrado" sale del tablero y va al historial, igual que en la v1. */
const BOARD_STATUSES = TICKET_STATUSES.filter((status) => status !== 'closed');
const BOARD_STATUS_LABELS: Record<Exclude<TicketStatus, 'closed'>, string> = {
  pending: 'Pendientes',
  in_progress: 'En Proceso',
  in_testing: 'En Pruebas',
  done: 'Terminados',
};
const formatDate = (value: string) => new Date(value).toLocaleDateString('es-CL');
const formatHours = (value: number) => String(Number(value.toFixed(2)));

/**
 * Tablero Kanban de tickets — réplica de `Soporte/index.tsx` (v1): columnas
 * por estado, tarjetas arrastrables y ficha en modal. El drop llama al mismo
 * `ChangeTicketStatusUseCase` que el selector de la ficha, así que el flujo
 * forzado (incidentes que saltan "En Pruebas", solución obligatoria antes de
 * avanzar, bloqueo sin responsable) aplica igual desde acá — un drop inválido
 * vuelve como error y abre la ficha para corregirlo.
 */
export function TicketsListPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [dragOverStatus, setDragOverStatus] = useState<TicketStatus | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);

  const changeStatus = useChangeTicketStatus();
  const { data: clients } = useTicketLinkableClients();
  const { data: users } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });

  const baseFilters = {
    search: search || undefined,
    clientId: clientIds.length > 0 ? clientIds : undefined,
    assigneeUserId: assigneeUserIds.length > 0 ? assigneeUserIds : undefined,
    pageSize: 200,
  };

  const pending = useTicketsList({ ...baseFilters, status: 'pending' });
  const inProgress = useTicketsList({ ...baseFilters, status: 'in_progress' });
  const inTesting = useTicketsList({ ...baseFilters, status: 'in_testing' });
  const done = useTicketsList({ ...baseFilters, status: 'done' });

  const columns = useMemo(
    () => ({
      pending: pending.data?.items ?? [],
      in_progress: inProgress.data?.items ?? [],
      in_testing: inTesting.data?.items ?? [],
      done: done.data?.items ?? [],
    }),
    [pending.data, inProgress.data, inTesting.data, done.data],
  );

  // Réplica de `TicketNavigationState` en v1: abre la ficha de un ticket al llegar por enlace.
  useEffect(() => {
    const state = location.state as { openTicketId?: string } | null;
    if (state?.openTicketId) {
      setOpenTicketId(state.openTicketId);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = async (event: React.DragEvent, targetStatus: TicketStatus) => {
    event.preventDefault();
    setDragOverStatus(null);
    const ticketId = event.dataTransfer.getData('ticketId');
    const fromStatus = event.dataTransfer.getData('fromStatus');
    if (!ticketId || fromStatus === targetStatus) return;
    try {
      await changeStatus.mutateAsync({ ticketId, input: { status: targetStatus } });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar el estado del ticket.');
      setOpenTicketId(ticketId);
    }
  };

  return (
    <DashboardLayout title="Tickets">
      <div className={styles.page}>
        <div className={styles.toolbar}>
          <div className={styles.filtersRow}>
            <TextField
              className={styles.search}
              label="Buscar"
              type="search"
              placeholder="Buscar por código o título"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              iconLeft={<SearchIcon size={16} />}
            />
            <MultiSelect
              className={styles.filter}
              label="Cliente"
              placeholder="Todos"
              searchPlaceholder="Buscar cliente"
              options={(clients ?? []).map((client) => ({ value: client.id, label: client.companyName }))}
              value={clientIds}
              onChange={setClientIds}
            />
            <MultiSelect
              className={styles.filter}
              label="Responsable"
              placeholder="Todos"
              searchPlaceholder="Buscar responsable"
              options={(users?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
              value={assigneeUserIds}
              onChange={setAssigneeUserIds}
            />
          </div>
          <div className={styles.toolbarActions}>
            {can('tickets:create') && (
              <Button iconLeft={<PlusIcon size={18} />} onClick={() => setCreatingTicket(true)}>
                Nuevo Ticket
              </Button>
            )}
            <Button variant="tertiary" onClick={() => navigate('/tickets/historial-tickets')}>
              Ver Historial de Tickets
            </Button>
          </div>
        </div>

        <div className={styles.board}>
          {BOARD_STATUSES.map((status) => {
            const stageTickets = columns[status as keyof typeof columns];
            return (
              <div
                key={status}
                className={[styles.column, dragOverStatus === status ? styles.columnDragOver : ''].filter(Boolean).join(' ')}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverStatus(status);
                }}
                onDragLeave={() => setDragOverStatus(null)}
                onDrop={(event) => void handleDrop(event, status)}
              >
                <div className={styles.columnHeader}>
                  {BOARD_STATUS_LABELS[status as keyof typeof BOARD_STATUS_LABELS]} ({stageTickets.length})
                </div>
                <div className={styles.columnBody}>
                  {stageTickets.length === 0 && <p className={styles.empty}>Sin tickets</p>}
                  {stageTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      onOpen={() => setOpenTicketId(ticket.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('ticketId', ticket.id);
                        event.dataTransfer.setData('fromStatus', ticket.status);
                        event.dataTransfer.effectAllowed = 'move';
                      }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {openTicketId && <TicketDetailModal ticketId={openTicketId} onClose={() => setOpenTicketId(null)} />}

      <NewTicketDialog
        open={creatingTicket}
        onClose={() => setCreatingTicket(false)}
        onCreated={(ticketId) => {
          setCreatingTicket(false);
          setOpenTicketId(ticketId);
        }}
      />
    </DashboardLayout>
  );
}

function TicketCard({
  ticket,
  onOpen,
  onDragStart,
}: {
  ticket: TicketSummary;
  onOpen: () => void;
  onDragStart: (event: React.DragEvent) => void;
}) {
  return (
    <button
      type="button"
      className={[styles.ticket, !ticket.assignee ? styles.ticketUnassigned : ''].filter(Boolean).join(' ')}
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
    >
      <div className={styles.ticketHeader}>
        <div className={styles.hhChips}>
          <span className={styles.hhChip}>{ticket.estimatedHours ?? 0}hr</span>
          {ticket.pendingHhRequestsCount > 0 && (
            <span
              className={styles.pendingHhChip}
              title={`${ticket.pendingHhRequestsCount} solicitud(es) de HH pendientes de aprobar`}
            >
              <ClockIcon size={12} />
              {formatHours(ticket.pendingHhHours)}h por aprobar
            </span>
          )}
        </div>
        <TicketPriorityBadge priority={ticket.priority} />
      </div>
      <div className={styles.divider} />
      <div className={styles.idRow}>
        {ticket.serviceType === 'improvement' ? <SparklesIcon size={16} /> : <AlertIcon size={16} />}
        <span className={styles.code}>{ticket.code ?? '—'}</span>
        <div className={styles.separator} />
        <span className={styles.title}>{ticket.title}</span>
      </div>
      <div className={styles.infoRow}>
        <span>{ticket.project?.name ?? '—'}</span>
      </div>
      <div className={styles.infoRow}>
        <UserIcon size={16} />
        <span>{ticket.assignee?.fullName ?? 'Sin asignar'}</span>
      </div>
      <div className={styles.infoRow}>
        <CalendarIcon size={16} />
        <span>{formatDate(ticket.createdAt)}</span>
      </div>
    </button>
  );
}
