import { Fragment, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TICKET_STATUSES, type TicketSummary } from '@kora/contracts';
import styles from './TicketsListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { TextField } from '@/shared/components/ui/TextField';
import { CalendarIcon, ClockIcon, PlusIcon, SearchIcon, UserIcon } from '@/shared/components/icons/Icons';
import { TicketPriorityBadge } from '../components/TicketPriorityBadge';
import { TicketServiceTypeIcon } from '../components/TicketServiceTypeIcon';
import { TicketDetailModal } from '../components/TicketDetailModal';
import { NewTicketDialog } from '../components/NewTicketDialog';
import { useChangeTicketStatus, useTicketLinkableClients, useTicketsList } from '../api/tickets.queries';
import { ticketKeys } from '../api/tickets.api';
import { insertionIndex, useCardReflow, useTicketBoardDrag, type BoardStatus } from '../hooks/useTicketBoardDrag';
import { useUsersList } from '@/modules/users/api/users.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';

/** Sólo se muestran en el tablero — "Cerrado" sale del tablero y va al historial, igual que en la v1. */
const BOARD_STATUSES = TICKET_STATUSES.filter((status): status is BoardStatus => status !== 'closed');
const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  pending: 'Pendientes',
  in_progress: 'En Proceso',
  in_testing: 'En Pruebas',
  done: 'Terminados',
};
const MIN_SKELETON_MS = 1000;
const COLUMN_ENTER_STAGGER_MS = 70;
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
  const [leaderUserIds, setLeaderUserIds] = useState<string[]>([]);
  /** Movimientos optimistas: la tarjeta ya se ve en la columna destino mientras la API confirma. */
  const [pendingMoves, setPendingMoves] = useState<Record<string, { ticket: TicketSummary; toStatus: BoardStatus }>>({});
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [creatingTicket, setCreatingTicket] = useState(false);

  const queryClient = useQueryClient();
  const changeStatus = useChangeTicketStatus();
  const { data: clients } = useTicketLinkableClients();
  const { data: users } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName' });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });

  const baseFilters = {
    search: search || undefined,
    clientId: clientIds.length > 0 ? clientIds : undefined,
    assigneeUserId: assigneeUserIds.length > 0 ? assigneeUserIds : undefined,
    leaderUserId: leaderUserIds.length > 0 ? leaderUserIds : undefined,
    pageSize: 200,
  };

  const pending = useTicketsList({ ...baseFilters, status: 'pending' });
  const inProgress = useTicketsList({ ...baseFilters, status: 'in_progress' });
  const inTesting = useTicketsList({ ...baseFilters, status: 'in_testing' });
  const done = useTicketsList({ ...baseFilters, status: 'done' });

  const listQueries = [pending, inProgress, inTesting, done];
  const listsPending = listQueries.some((query) => query.isPending);
  // El skeleton dura al menos `MIN_SKELETON_MS` para que no parpadee si la API
  // responde rápido. Sólo si se entró sin datos: con caché el tablero sale al tiro.
  const [holdSkeleton, setHoldSkeleton] = useState(listsPending);
  useEffect(() => {
    if (!holdSkeleton) return;
    const timeout = setTimeout(() => setHoldSkeleton(false), MIN_SKELETON_MS);
    return () => clearTimeout(timeout);
  }, [holdSkeleton]);
  /** Primera carga: skeleton hasta que respondan las cuatro columnas, para que el tablero aparezca de una vez. */
  const boardLoading = listsPending || holdSkeleton;
  /** Cambio de filtros: alguna columna todavía muestra los datos del filtro anterior. */
  const boardSyncing = listQueries.some((query) => query.isPlaceholderData);

  // Mientras se sincroniza, el tablero se queda con el último resultado completo
  // en vez de ir actualizando columna por columna a medida que responde cada una.
  const settledServerRef = useRef<Record<BoardStatus, TicketSummary[]> | null>(null);
  const serverColumns = useMemo(() => {
    if (boardSyncing && settledServerRef.current) return settledServerRef.current;
    const next: Record<BoardStatus, TicketSummary[]> = {
      pending: pending.data?.items ?? [],
      in_progress: inProgress.data?.items ?? [],
      in_testing: inTesting.data?.items ?? [],
      done: done.data?.items ?? [],
    };
    settledServerRef.current = next;
    return next;
  }, [boardSyncing, pending.data, inProgress.data, inTesting.data, done.data]);

  const columns = useMemo(() => {
    const server = serverColumns;
    const moves = Object.values(pendingMoves);
    if (moves.length === 0) return server;
    const movedIds = new Set(moves.map((move) => move.ticket.id));
    const result = {} as Record<BoardStatus, TicketSummary[]>;
    for (const status of BOARD_STATUSES) result[status] = server[status].filter((ticket) => !movedIds.has(ticket.id));
    for (const { ticket, toStatus } of moves) {
      const list = result[toStatus];
      list.splice(insertionIndex(list, ticket), 0, { ...ticket, status: toStatus });
    }
    return result;
  }, [serverColumns, pendingMoves]);

  const boardRef = useRef<HTMLDivElement>(null);
  const snapshotReflow = useCardReflow(boardRef, columns);

  // Réplica de `TicketNavigationState` en v1: abre la ficha de un ticket al llegar por enlace.
  useEffect(() => {
    const state = location.state as { openTicketId?: string } | null;
    if (state?.openTicketId) {
      setOpenTicketId(state.openTicketId);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDrop = async (ticket: TicketSummary, toStatus: BoardStatus) => {
    snapshotReflow();
    setPendingMoves((previous) => ({ ...previous, [ticket.id]: { ticket, toStatus } }));
    try {
      await changeStatus.mutateAsync({ ticketId: ticket.id, input: { status: toStatus } });
      // Esperar el refetch que dispara la mutación antes de soltar el movimiento
      // optimista; si no, la tarjeta parpadea de vuelta en su columna vieja.
      await queryClient.refetchQueries({ queryKey: ticketKeys.lists(), type: 'active' }, { cancelRefetch: false });
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar el estado del ticket.');
      setOpenTicketId(ticket.id);
    } finally {
      snapshotReflow();
      setPendingMoves(({ [ticket.id]: _settled, ...rest }) => rest);
    }
  };

  const drag = useTicketBoardDrag({ boardRef, onDrop: (ticket, _from, toStatus) => void handleDrop(ticket, toStatus) });

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
            <MultiSelect
              className={styles.filter}
              label="Líder"
              placeholder="Todos"
              searchPlaceholder="Buscar líder"
              options={(leaders?.items ?? []).map((user) => ({ value: user.id, label: user.fullName }))}
              value={leaderUserIds}
              onChange={setLeaderUserIds}
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

        <div
          ref={boardRef}
          className={[styles.board, drag.session ? styles.boardDragging : '', boardSyncing ? styles.boardSyncing : '']
            .filter(Boolean)
            .join(' ')}
          aria-busy={boardLoading || boardSyncing}
        >
          {boardLoading && BOARD_STATUSES.map((status) => <SkeletonColumn key={status} label={BOARD_STATUS_LABELS[status]} />)}
          {!boardLoading && BOARD_STATUSES.map((status, columnIndex) => {
            const stageTickets = columns[status];
            const { session } = drag;
            const isOver = drag.overStatus === status;
            // El hueco existe (cerrado) en toda columna destino posible y se
            // abre al pasar por encima, así entra y sale con transición.
            const slotIndex =
              session?.phase === 'dragging' && session.fromStatus !== status ? insertionIndex(stageTickets, session.ticket) : -1;
            const slot = slotIndex !== -1 && (
              <div
                className={[styles.dropSlot, isOver ? styles.dropSlotOpen : ''].filter(Boolean).join(' ')}
                style={{ height: isOver ? session?.height : 0 }}
                onTransitionEnd={(event) => {
                  if (isOver && event.propertyName === 'height') {
                    event.currentTarget.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                  }
                }}
              />
            );
            return (
              <div
                key={status}
                ref={drag.registerColumn(status)}
                className={[styles.column, isOver ? styles.columnDragOver : ''].filter(Boolean).join(' ')}
              >
                <div className={styles.columnHeader}>
                  {BOARD_STATUS_LABELS[status]} ({stageTickets.length})
                </div>
                <div
                  className={[styles.columnBody, styles.columnBodyEnter].join(' ')}
                  style={{ animationDelay: `${columnIndex * COLUMN_ENTER_STAGGER_MS}ms` }}
                >
                  {stageTickets.length === 0 && !isOver && <p className={styles.empty}>Sin tickets</p>}
                  {stageTickets.map((ticket, index) => {
                    const isDragged = session?.ticket.id === ticket.id;
                    return (
                      <Fragment key={ticket.id}>
                        {index === slotIndex && slot}
                        <TicketCard
                          ticket={ticket}
                          data-ticket-id={ticket.id}
                          data-status={status}
                          className={[
                            isDragged && session?.phase === 'dragging' ? styles.ticketGhost : '',
                            isDragged && session?.phase !== 'dragging' ? styles.ticketHidden : '',
                            drag.settledTicketId === ticket.id ? styles.ticketSettled : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onAnimationEnd={(event) => {
                            if (event.target === event.currentTarget) drag.clearSettled();
                          }}
                          onPointerDown={(event) => drag.handleCardPointerDown(event, ticket, status)}
                          onClick={() => {
                            if (!drag.shouldIgnoreClick()) setOpenTicketId(ticket.id);
                          }}
                        />
                      </Fragment>
                    );
                  })}
                  {slotIndex === stageTickets.length && slot}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {drag.session &&
        createPortal(
          <div
            ref={drag.overlayRef}
            className={styles.dragOverlay}
            style={{ width: drag.session.width, transformOrigin: `${drag.session.grabX}px ${drag.session.grabY}px` }}
            aria-hidden
          >
            <div
              className={[styles.dragOverlayCard, drag.session.phase !== 'dragging' ? styles.dragOverlayCardLanding : '']
                .filter(Boolean)
                .join(' ')}
            >
              <TicketCard ticket={drag.session.ticket} tabIndex={-1} />
            </div>
          </div>,
          document.body,
        )}

      {openTicketId && <TicketDetailModal ticketId={openTicketId} onClose={() => setOpenTicketId(null)} />}

      <NewTicketDialog open={creatingTicket} onClose={() => setCreatingTicket(false)} />
    </DashboardLayout>
  );
}

const SKELETON_CARDS_PER_COLUMN = 4;

/** Columna de carga con la misma estructura que la real, así no hay salto al llegar los datos. */
function SkeletonColumn({ label }: { label: string }) {
  return (
    <div className={styles.column} aria-hidden>
      <div className={styles.columnHeader}>
        {label} <span className={[styles.skeletonBar, styles.skeletonCount].join(' ')} />
      </div>
      <div className={styles.columnBody}>
        {Array.from({ length: SKELETON_CARDS_PER_COLUMN }, (_, index) => (
          <div key={index} className={[styles.ticket, styles.skeletonCard].join(' ')}>
            <div className={styles.ticketHeader}>
              <span className={[styles.skeletonBar, styles.skeletonChip].join(' ')} />
              <span className={[styles.skeletonBar, styles.skeletonChip].join(' ')} />
            </div>
            <div className={styles.divider} />
            <span className={[styles.skeletonBar, styles.skeletonTitle].join(' ')} />
            <span className={[styles.skeletonBar, styles.skeletonLine].join(' ')} style={{ width: '55%' }} />
            <span className={[styles.skeletonBar, styles.skeletonLine].join(' ')} style={{ width: '70%' }} />
            <span className={[styles.skeletonBar, styles.skeletonLine].join(' ')} style={{ width: '40%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function TicketCard({ ticket, className, ...buttonProps }: { ticket: TicketSummary } & ComponentPropsWithoutRef<'button'>) {
  return (
    <button
      type="button"
      className={[styles.ticket, !ticket.assignee ? styles.ticketUnassigned : '', className].filter(Boolean).join(' ')}
      {...buttonProps}
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
        <TicketServiceTypeIcon serviceType={ticket.serviceType} />
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
