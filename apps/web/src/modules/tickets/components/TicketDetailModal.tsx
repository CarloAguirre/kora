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
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  PaperclipIcon,
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

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const second = parts.length > 1 ? parts[1]![0]! : (parts[0]![1] ?? '');
  return (first + second).toUpperCase();
}

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

  const onToggleOvertime = async () => {
    if (!ticket) return;
    try {
      await updateTicket.mutateAsync({ ticketId, input: { allowsOvertime: !ticket.allowsOvertime } });
      toast.success(ticket.allowsOvertime ? 'Se retiró la autorización de horas extra.' : 'Se autorizaron horas extra para este ticket.');
    } catch (error) {
      reportError(error, 'No se pudo actualizar la autorización de horas extra.');
    }
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

            <div className={styles.factsGrid}>
              <div className={styles.factCell}>
                <span className={styles.factLabel}>Cliente</span>
                <span className={styles.factValue}>{ticket.client?.companyName ?? '—'}</span>
              </div>
              <div className={styles.factCell}>
                <span className={styles.factLabel}>Prioridad</span>
                {ticket.priority ? (
                  <span className={[styles.priorityChip, priorityStyles[ticket.priority]].join(' ')}>
                    {TICKET_PRIORITY_LABELS[ticket.priority]}
                  </span>
                ) : (
                  <span className={styles.factValue}>—</span>
                )}
              </div>

              <div className={styles.factCell}>
                <span className={styles.factLabel}>Proyecto soporte</span>
                <span className={styles.factValue}>{ticket.project?.name ?? '—'}</span>
              </div>
              <div className={styles.factCell}>
                <span className={styles.factLabel}>Fecha de creación</span>
                <span className={styles.factValue}>
                  <CalendarIcon size={14} /> {formatDate(ticket.createdAt)}
                </span>
              </div>

              <div className={styles.factCell}>
                <span className={styles.factLabel}>Proyecto desarrollo</span>
                <span className={styles.factValue}>{ticket.developmentProject?.name ?? '—'}</span>
              </div>
              <div className={styles.factCell}>
                <span className={styles.factLabel}>HH utilizadas / estimadas</span>
                <HhBreakdownTooltip breakdown={hhBreakdown}>
                  <div className={styles.hhProgressRow}>
                    <span className={styles.hhProgressTrack}>
                      <span
                        className={styles.hhProgressFill}
                        style={{ width: `${ticket.estimatedHours ? Math.min(100, (ticket.usedHours / ticket.estimatedHours) * 100) : 0}%` }}
                      />
                    </span>
                    <span className={styles.factValue}>
                      {ticket.usedHours} / {ticket.estimatedHours ?? '—'}hrs
                    </span>
                  </div>
                </HhBreakdownTooltip>
              </div>

              <div className={styles.factCell}>
                <span className={styles.factLabel}>Responsable</span>
                {ticket.assignee ? (
                  <div className={styles.assigneeValue}>
                    <span className={styles.avatar}>{initials(ticket.assignee.fullName)}</span>
                    <span className={styles.factValue}>{ticket.assignee.fullName}</span>
                  </div>
                ) : (
                  <span className={styles.factValue}>Sin asignar</span>
                )}
              </div>
              <div className={styles.factCell}>
                <span className={styles.factLabel}>Horas extra</span>
                <div className={styles.overtimeValueRow}>
                  <span className={styles.factValue}>{ticket.allowsOvertime ? 'Autorizadas' : 'No autorizadas'}</span>
                  {ticket.canAuthorizeOvertime && ticket.status !== 'closed' && (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={updateTicket.isPending}
                      onClick={() => void onToggleOvertime()}
                    >
                      {ticket.allowsOvertime ? 'Retirar' : 'Autorizar'}
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className={styles.contentCard}>
              <div className={styles.contentSection}>
                <div className={styles.contentSectionHeader}>
                  <AlertIcon size={16} />
                  <span className={styles.label}>Descripción del incidente</span>
                  {!ticket.description && <span className={styles.emptyInline}>Sin descripción</span>}
                </div>
                {ticket.description && <p className={styles.text}>{ticket.description}</p>}
              </div>

              <div className={styles.contentDivider} />

              <div className={styles.contentSection}>
                <div className={styles.contentSectionHeader}>
                  <PaperclipIcon size={16} />
                  <span className={styles.label}>Evidencia</span>
                  {!ticket.evidenceUrl && <span className={styles.emptyInline}>Sin evidencia adjunta</span>}
                </div>
                {ticket.evidenceUrl &&
                  (isSafeHttpUrl(ticket.evidenceUrl) ? (
                    <a className={styles.text} href={ticket.evidenceUrl} target="_blank" rel="noreferrer">
                      {ticket.evidenceUrl}
                    </a>
                  ) : (
                    <p className={styles.text}>{ticket.evidenceUrl}</p>
                  ))}
              </div>

              <div className={styles.contentDivider} />

              <div className={styles.contentSection}>
                <div className={styles.contentSectionHeader}>
                  <CheckIcon size={16} />
                  <span className={styles.label}>Solución aplicada</span>
                  {!ticket.resolution && <span className={styles.emptyInline}>Sin solución registrada</span>}
                </div>
                {/* Igual que en la v1: acá siempre es de solo lectura — la solución se
                    pide al confirmar "Terminar Proceso"/"Marcar Terminado" (ver CompleteTicketDialog). */}
                {ticket.resolution && <p className={styles.text}>{ticket.resolution}</p>}
              </div>
            </div>

            <TicketHhRequestsSection
              ticketId={ticketId}
              canRequest={ticket.canRequestHh}
              allowsOvertime={ticket.allowsOvertime}
              pendingHhRequestsCount={ticket.pendingHhRequestsCount}
              pendingHhHours={ticket.pendingHhHours}
              hhApprovers={ticket.hhApprovers}
            />

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
                  {ticket.history.map((entry, index) => (
                    <div key={entry.id} className={styles.historyEntry}>
                      <div className={styles.historyIconCol}>
                        <span className={styles.historyIcon}>{historyEventIcon(entry.eventType)}</span>
                        {index < ticket.history.length - 1 && <span className={styles.historyLine} />}
                      </div>
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
                  {ticket.status !== 'done' && ticket.canEditDetails && (
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
