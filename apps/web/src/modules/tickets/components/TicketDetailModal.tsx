import { useState } from 'react';
import {
  TICKET_PRIORITY_LABELS,
  nextForwardTicketStatus,
  type TicketStatus,
} from '@kora/contracts';
import styles from './TicketDetailModal.module.css';
import priorityStyles from './TicketPriorityBadge.module.css';
import { Button } from '@/shared/components/ui/Button';
import {
  AlertIcon,
  ArrowUpDownIcon,
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
} from '@/shared/components/icons/Icons';
import { TicketStatusBadge } from './TicketStatusBadge';
import { TicketHhRequestsSection } from './TicketHhRequestsSection';
import { HhBreakdownTooltip } from './HhBreakdownTooltip';
import { EditTicketDialog } from './EditTicketDialog';
import { CompleteTicketDialog } from './CompleteTicketDialog';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { useChangeTicketStatus, useDeleteTicket, useTicketDetail, useUpdateTicket } from '../api/tickets.queries';
import { useTicketHhRequestsList } from '../api/ticket-hh-requests.queries';
import { computeApprovedHhBreakdown } from '../lib/ticket-hh-breakdown';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const formatDate = (value: string) => new Date(value).toLocaleDateString('es-CL');

/** Sólo se enlaza si es http(s) — evita que un `javascript:` guardado como "evidencia" se ejecute al hacer clic. */
function isSafeHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

/**
 * Ícono por tipo de evento — solo para orientar de un vistazo, no intenta
 * cubrir cada `eventType` legacy posible. La descripción (`entry.description`)
 * ya narra el evento en español; `metadata` (JSON heredado de la v1, sin forma
 * fija) es redundante con ella en la práctica y no se muestra en crudo.
 */
function historyEventIcon(eventType: string) {
  const type = eventType.toLowerCase();
  if (type.includes('creat')) return <PlusIcon size={14} />;
  if (type.includes('hh')) return <ClockIcon size={14} />;
  if (type.includes('status') || type.includes('estado') || type.includes('reopen') || type.includes('clos')) {
    return <ArrowUpDownIcon size={14} />;
  }
  if (type.includes('solution') || type.includes('solucion')) return <AlertIcon size={14} />;
  return <PencilIcon size={14} />;
}

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
 * La solicitud de horas (`ticket_hh_request`) también está — es el "siguiente
 * paso de M5" que docs/DECISION-M5-TICKETS.md dejaba anotado.
 */
export function TicketDetailModal({ ticketId, onClose }: { ticketId: string; onClose: () => void }) {
  const toast = useToast();
  const { data: ticket, isLoading, error } = useTicketDetail(ticketId);
  const changeStatus = useChangeTicketStatus();
  const updateTicket = useUpdateTicket();
  const deleteTicket = useDeleteTicket();
  const forbidden = error instanceof ApiRequestError && error.isForbidden;
  const forwardStatus = ticket ? nextForwardTicketStatus(ticket.status, ticket.serviceType) : null;
  const isUnassignedPending = ticket ? ticket.status === 'pending' && !ticket.assignee : false;
  const { data: hhRequests } = useTicketHhRequestsList(ticketId);
  const hhBreakdown = computeApprovedHhBreakdown(hhRequests);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

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

  /**
   * Igual que la v1: la solución se pide justo al confirmar el paso a
   * "Terminado", no antes — nunca queda un campo editable esperando mientras
   * el ticket sigue en trabajo (ver `CompleteTicketDialog`).
   */
  const onCompleteWithResolution = async (resolution: string) => {
    await updateTicket.mutateAsync({ ticketId, input: { resolution } });
    await changeStatus.mutateAsync({ ticketId, input: { status: 'done' } });
    toast.success('Se registró la solución y se terminó el ticket.');
  };

  if (!error && (isLoading || !ticket)) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.spinner} role="status" aria-label="Cargando" onClick={(event) => event.stopPropagation()} />
      </div>
    );
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={ticket?.title ?? 'Ticket'} onClick={(event) => event.stopPropagation()}>
        {error ? (
          <p className={styles.value}>{forbidden ? 'No tienes acceso a este ticket.' : 'No se pudo cargar el ticket.'}</p>
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
                  <HhBreakdownTooltip breakdown={hhBreakdown}>
                    <span className={styles.value}>{ticket.usedHours}hrs</span>
                  </HhBreakdownTooltip>
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
              <span className={styles.label}>Evidencia:</span>
              {ticket.evidenceUrl ? (
                isSafeHttpUrl(ticket.evidenceUrl) ? (
                  <a className={styles.text} href={ticket.evidenceUrl} target="_blank" rel="noreferrer">
                    {ticket.evidenceUrl}
                  </a>
                ) : (
                  <p className={styles.text}>{ticket.evidenceUrl}</p>
                )
              ) : (
                <span className={styles.empty}>Sin evidencia adjunta</span>
              )}
            </div>

            <div className={styles.section}>
              <span className={styles.label}>Solución aplicada:</span>
              {/* Igual que en la v1: acá siempre es de solo lectura — la solución se
                  pide al confirmar "Terminar Proceso"/"Marcar Terminado" (ver CompleteTicketDialog). */}
              {ticket.resolution ? (
                <p className={styles.text}>{ticket.resolution}</p>
              ) : (
                <span className={styles.empty}>Sin solución registrada</span>
              )}
            </div>

            <div className={styles.section}>
              <TicketHhRequestsSection ticketId={ticketId} canRequest={ticket.canRequestHh} />
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
                      <span className={styles.historyIcon}>{historyEventIcon(entry.eventType)}</span>
                      <div className={styles.historyBody}>
                        <p className={styles.historyDescription}>{entry.description}</p>
                        <p className={styles.historyMeta}>
                          {entry.actorName ?? 'Sistema'} · {formatDateTime(entry.occurredAt)}
                        </p>
                      </div>
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
                      onClick={() => {
                        if (forwardStatus === 'closed') return setCloseOpen(true);
                        if (forwardStatus === 'done' && !ticket.resolution) return setCompleteOpen(true);
                        void onStatusChange(forwardStatus);
                      }}
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
            {forwardStatus === 'done' && (
              <CompleteTicketDialog
                open={completeOpen}
                confirmLabel={forwardActionLabel(ticket.status, forwardStatus)}
                onClose={() => setCompleteOpen(false)}
                onConfirm={onCompleteWithResolution}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
