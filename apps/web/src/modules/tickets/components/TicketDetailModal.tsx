import { useEffect, useState } from 'react';
import {
  TICKET_PRIORITY_LABELS,
  nextForwardTicketStatus,
  type TicketStatus,
} from '@kora/contracts';
import styles from './TicketDetailModal.module.css';
import priorityStyles from './TicketPriorityBadge.module.css';
import { Button } from '@/shared/components/ui/Button';
import { AlertIcon, CalendarIcon, ChevronDownIcon, ClockIcon, CloseIcon, PencilIcon, SparklesIcon } from '@/shared/components/icons/Icons';
import { TicketStatusBadge } from './TicketStatusBadge';
import { TicketHhRequestsSection } from './TicketHhRequestsSection';
import { EditTicketDialog } from './EditTicketDialog';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { useChangeTicketStatus, useDeleteTicket, useTicketDetail, useUpdateTicket } from '../api/tickets.queries';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const formatDate = (value: string) => new Date(value).toLocaleDateString('es-CL');

/**
 * Etiqueta del botón de avance forzado — replica `stageActionLabel` de la v1.
 * El retroceso de estado no vive en el modal: en la v1 se hace arrastrando la
 * tarjeta en el tablero, no hay selector de estado en la ficha.
 */
function forwardActionLabel(current: TicketStatus, target: TicketStatus): string {
  switch (target) {
    case 'pending':
      return '';
    case 'in_progress':
      return 'Iniciar Proceso';
    case 'in_testing':
      return 'Iniciar Pruebas';
    case 'done':
      return current === 'in_testing' ? 'Marcar Terminado' : 'Terminar Proceso';
    case 'closed':
      return 'Cerrar Ticket';
  }
}

/**
 * Ficha de ticket como modal sobre el tablero — así se ve en la v1
 * (`Soporte/index.tsx`, vista `detail`), en vez de una página de ruta propia.
 * No incluye evidencia adjunta — ver docs/DECISION-M5-TICKETS.md. La
 * solicitud de horas (`ticket_hh_request`) sí está — es el "siguiente paso
 * de M5" que ese mismo documento dejaba anotado.
 */
export function TicketDetailModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const { can } = usePermissions();
  const toast = useToast();
  const { data: ticket, isLoading, error } = useTicketDetail(ticketId);
  const changeStatus = useChangeTicketStatus();
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();
  const forbidden = error instanceof ApiRequestError && error.isForbidden;
  const forwardStatus = ticket ? nextForwardTicketStatus(ticket.status, ticket.serviceType) : null;
  const isUnassignedPending = ticket ? ticket.status === 'pending' && !ticket.assignee : false;

  const [resolutionDraft, setResolutionDraft] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  useEffect(() => {
    setResolutionDraft(ticket?.resolution ?? '');
  }, [ticket?.resolution]);

  const reportError = (error: unknown, fallback: string) => {
    toast.error(error instanceof ApiRequestError ? error.message : fallback);
  };

  const onStatusChange = async (status: TicketStatus) => {
    try {
      await changeStatus.mutateAsync({ ticketId, input: { status } });
      toast.success('Se actualizó el estado del ticket.');
    } catch (error) {
      reportError(error, 'No se pudo actualizar el estado del ticket.');
    }
  };

  const onSaveResolution = async () => {
    try {
      await updateTicket.mutateAsync({ ticketId, input: { resolution: resolutionDraft } });
      toast.success('Se guardó la solución del ticket.');
    } catch (error) {
      reportError(error, 'No se pudo guardar la solución.');
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={ticket?.title ?? 'Ticket'} onClick={(event) => event.stopPropagation()}>
        {error ? (
          <p className={styles.value}>{forbidden ? 'No tienes acceso a este ticket.' : 'No se pudo cargar el ticket.'}</p>
        ) : isLoading || !ticket ? (
          <p className={styles.value}>Cargando…</p>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                {ticket.serviceType === 'improvement' ? <SparklesIcon size={16} /> : <AlertIcon size={16} />}
                <span className={styles.code}>{ticket.code ?? '—'}</span>
                <div className={styles.sep} />
                <span className={styles.title}>{ticket.title}</span>
              </div>
              <div className={styles.headerRight}>
                <TicketStatusBadge status={ticket.status} />
                <button type="button" className={styles.closeButton} aria-label="Cerrar" onClick={onClose}>
                  <CloseIcon size={16} />
                </button>
              </div>
            </div>

            {!ticket.assignee && ticket.status === 'pending' && (
              <div className={styles.warningBanner}>
                <AlertIcon size={20} />
                <span>Es necesario asignar un responsable para dar inicio al ticket de soporte.</span>
              </div>
            )}

            <div className={styles.row}>
              <span className={styles.label}>Cliente:</span>
              <span className={styles.value}>{ticket.client?.companyName ?? '—'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Proyecto Soporte:</span>
              <span className={styles.value}>{ticket.project?.name ?? '—'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Proyecto Desarrollo:</span>
              <span className={styles.value}>{ticket.developmentProject?.name ?? '—'}</span>
            </div>
            <div className={styles.row}>
              <span className={styles.label}>Responsable:</span>
              <span className={styles.value}>{ticket.assignee?.fullName ?? 'Sin asignar'}</span>
            </div>

            <div className={styles.dates}>
              <div className={styles.col}>
                <div className={styles.row}>
                  <CalendarIcon size={16} />
                  <span className={styles.label}>Fecha:</span>
                  <span className={styles.value}>{formatDate(ticket.createdAt)}</span>
                </div>
              </div>
              <div className={styles.col}>
                <div className={styles.row}>
                  <ClockIcon size={16} />
                  <span className={styles.label}>HH Estimadas:</span>
                  <span className={styles.value}>{ticket.estimatedHours ?? '—'}hrs</span>
                </div>
                <div className={styles.row}>
                  <ClockIcon size={16} />
                  <span className={styles.label}>HH Utilizadas:</span>
                  <span className={styles.value}>{ticket.usedHours}hrs</span>
                </div>
              </div>
            </div>

            {ticket.priority && (
              <div className={styles.row}>
                <span className={styles.label}>Prioridad:</span>
                <span className={[styles.priorityChip, priorityStyles[ticket.priority]].join(' ')}>
                  {TICKET_PRIORITY_LABELS[ticket.priority]}
                </span>
              </div>
            )}

            <div className={styles.divider} />

            <div className={styles.section}>
              <span className={styles.label}>Descripción del incidente:</span>
              {ticket.description ? <p className={styles.text}>{ticket.description}</p> : <span className={styles.empty}>Sin descripción</span>}
            </div>

            <div className={styles.section}>
              <span className={styles.label}>Solución aplicada:</span>
              {/* En la v1 el editor de solución solo aparece al avanzar el ticket ("Terminar Proceso"),
                  nunca en Pendiente ni en Cerrado — ahí siempre es de solo lectura. */}
              {ticket.resolution ? (
                <p className={styles.text}>{ticket.resolution}</p>
              ) : ticket.canManage && ticket.status !== 'pending' && ticket.status !== 'closed' ? (
                <div className={styles.resolutionEditor}>
                  <textarea
                    className={styles.resolutionInput}
                    value={resolutionDraft}
                    placeholder="Describe la solución aplicada"
                    onChange={(event) => setResolutionDraft(event.target.value)}
                  />
                  <Button
                    variant="tertiary"
                    size="sm"
                    loading={updateTicket.isPending}
                    disabled={resolutionDraft === (ticket.resolution ?? '')}
                    onClick={() => void onSaveResolution()}
                  >
                    Guardar solución
                  </Button>
                </div>
              ) : (
                <span className={styles.empty}>Sin solución registrada</span>
              )}
            </div>

            <div className={styles.section}>
              <TicketHhRequestsSection ticketId={ticketId} canRequest={can('hours:register') && Boolean(ticket.project)} />
            </div>

            <div className={styles.divider} />

            <div className={styles.historyBox}>
              <button
                type="button"
                className={styles.historyToggle}
                onClick={() => setHistoryOpen((open) => !open)}
                aria-expanded={historyOpen}
              >
                <span className={styles.label}>Historial de ticket:</span>
                <ChevronDownIcon size={16} className={historyOpen ? styles.historyChevronOpen : styles.historyChevron} />
              </button>
              {historyOpen && (
                <div className={styles.history}>
                  {ticket.history.length === 0 && <span className={styles.empty}>Sin eventos todavía.</span>}
                  {ticket.history.map((entry) => (
                    <div key={entry.id} className={styles.historyEntry}>
                      <p className={styles.historyDescription}>{entry.description}</p>
                      <p className={styles.historyMeta}>
                        {entry.actorName ?? 'Sistema'} · {formatDateTime(entry.occurredAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.divider} />

            {ticket.canManage && ticket.status !== 'closed' && (
              <div className={styles.footer}>
                {ticket.status !== 'done' && ticket.canDelete && (
                  <Button variant="tertiary" onClick={() => setDeleteOpen(true)}>
                    Eliminar ticket
                  </Button>
                )}
                <div className={styles.footerRight}>
                  {ticket.status !== 'done' && (
                    <Button variant="outlineDark" iconLeft={<PencilIcon size={16} />} onClick={() => setEditOpen(true)}>
                      Editar
                    </Button>
                  )}
                  {forwardStatus && (
                    <Button
                      variant="primary"
                      disabled={isUnassignedPending}
                      loading={changeStatus.isPending}
                      onClick={() => (forwardStatus === 'closed' ? setCloseOpen(true) : void onStatusChange(forwardStatus))}
                    >
                      {forwardActionLabel(ticket.status, forwardStatus)}
                    </Button>
                  )}
                </div>
              </div>
            )}

            <EditTicketDialog ticket={ticket} open={editOpen} onClose={() => setEditOpen(false)} />
            <ConfirmActionDialog
              open={deleteOpen}
              title="Eliminar ticket"
              description={`¿Eliminar el ticket "${ticket.title}"? Esta acción no se puede deshacer.`}
              confirmLabel="Eliminar"
              destructive
              onClose={() => setDeleteOpen(false)}
              onConfirm={async () => {
                await deleteTicket.mutateAsync(ticket.id);
                toast.success('Se eliminó el ticket.');
                onClose();
              }}
            />
            <ConfirmActionDialog
              open={closeOpen}
              title="Cerrar ticket"
              description={`Al cerrar el ticket "${ticket.title}" saldrá del tablero y se trasladará al repositorio de cerrados. ¿Deseas confirmar el cierre?`}
              confirmLabel="Cerrar Ticket"
              onClose={() => setCloseOpen(false)}
              onConfirm={async () => {
                await changeStatus.mutateAsync({ ticketId, input: { status: 'closed' } });
                toast.success('Se cerró el ticket.');
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
