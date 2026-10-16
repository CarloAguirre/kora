import { useState } from 'react';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_SERVICE_TYPE_LABELS,
  nextForwardTicketStatus,
  type TicketStatus,
} from '@kora/contracts';
import styles from './TicketDetailModal.module.css';
import priorityStyles from './TicketPriorityBadge.module.css';
import { Button } from '@/shared/components/ui/Button';
import { Avatar } from '@/shared/components/ui/Avatar';
import {
  AlertIcon,
  ArrowUpDownIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  PaperclipIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  TriangleAlertIcon,
} from '@/shared/components/icons/Icons';
import { TicketStatusBadge } from './TicketStatusBadge';
import { TicketServiceTypeIcon } from './TicketServiceTypeIcon';
import { ticketDescriptionLabel } from '../lib/ticket-description-label';
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
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

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

/** Umbral a partir del cual un texto largo (descripción/solución) se colapsa por defecto — evita que un incidente muy narrado empuje el resto de la ficha fuera de vista. */
const LONG_TEXT_THRESHOLD = 280;

/** Texto colapsable con "Ver más"/"Ver menos" — usado por "Descripción del incidente" y "Solución aplicada". */
function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > LONG_TEXT_THRESHOLD;

  return (
    <div>
      <p className={isLong && !expanded ? `${styles.text} ${styles.textClamped}` : styles.text}>{text}</p>
      {isLong && (
        <button type="button" className={styles.seeMoreText} onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      )}
    </div>
  );
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
 *
 * Encabezado y pie quedan fijos; solo el cuerpo hace scroll, así las acciones
 * ("Terminar proceso", "Editar") están siempre a mano en fichas largas.
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
  // `ticketId` puede llegar como código (`TK-1072`, al abrir la ficha por enlace): el detalle lo
  // resuelve, pero las rutas de solicitudes de HH esperan el uuid — se usa el ya resuelto.
  const hhTicketId = ticket?.id ?? null;
  const { data: hhRequests } = useTicketHhRequestsList(hhTicketId);
  const hhBreakdown = computeApprovedHhBreakdown(hhRequests);
  const approvedHours = hhBreakdown.reduce((sum, person) => sum + person.hours, 0);
  // En soporte las horas sobre la jornada de 8h quedan solas como horas extra (ver `CreateTicketHhRequestUseCase`).
  const overtimeRequests = (hhRequests ?? []).filter((request) => request.isOvertime);
  const approvedOvertimeHours = overtimeRequests
    .filter((request) => request.status === 'approved')
    .reduce((sum, request) => sum + request.hours, 0);
  const pendingOvertimeHours = overtimeRequests
    .filter((request) => request.status === 'pending')
    .reduce((sum, request) => sum + request.hours, 0);

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

  const hhPercent = ticket?.estimatedHours ? Math.min(100, (ticket.usedHours / ticket.estimatedHours) * 100) : 0;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label={ticket?.title ?? 'Ticket'} onClick={(event) => event.stopPropagation()}>
        {error ? (
          <div className={styles.body}>
            <p className={styles.value}>{forbidden ? 'No tienes acceso a este ticket.' : 'No se pudo cargar el ticket.'}</p>
          </div>
        ) : (
          <>
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.typeIcon} title={TICKET_SERVICE_TYPE_LABELS[ticket.serviceType ?? 'incident']}>
                  <TicketServiceTypeIcon serviceType={ticket.serviceType} />
                </span>
                <span className={styles.code}>{ticket.code ?? '—'}</span>
                <div className={styles.sep} />
                <span className={styles.title} title={ticket.title}>
                  {ticket.title}
                </span>
              </div>
              <div className={styles.headerRight}>
                <TicketStatusBadge status={ticket.status} />
                <button type="button" className={styles.closeButton} aria-label="Cerrar" onClick={onClose}>
                  <CloseIcon size={18} />
                </button>
              </div>
            </div>

            <div className={styles.body}>
              {!ticket.assignee && ticket.status === 'pending' && (
                <div className={styles.warningBanner}>
                  <TriangleAlertIcon size={18} />
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
                  <span className={styles.factLabel}>Contrato</span>
                  <span className={styles.factValue}>{ticket.project?.name ?? '—'}</span>
                </div>
                <div className={styles.factCell}>
                  <span className={styles.factLabel}>Fecha de creación</span>
                  <span className={styles.factValue}>{formatDate(ticket.createdAt)}</span>
                </div>

                <div className={styles.factCell}>
                  <span className={styles.factLabel}>Proyecto desarrollo</span>
                  <span className={styles.factValue}>{ticket.developmentProject?.name ?? '—'}</span>
                </div>
                <div className={styles.factCell}>
                  <span className={styles.factLabel}>HH utilizadas / estimadas</span>
                  <HhBreakdownTooltip breakdown={hhBreakdown}>
                    <div className={styles.hhProgressRow}>
                      <span
                        className={styles.hhProgressTrack}
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(hhPercent)}
                      >
                        <span className={styles.hhProgressFill} style={{ width: `${hhPercent}%` }} />
                      </span>
                      <span className={styles.hhValue}>
                        {formatHours(ticket.usedHours)} / {ticket.estimatedHours ?? '—'} h
                      </span>
                    </div>
                  </HhBreakdownTooltip>
                  {(approvedHours > 0 || ticket.pendingHhHours > 0) && (
                    <span className={styles.factHint}>
                      {formatHours(approvedHours)} h aprobadas · {formatHours(ticket.pendingHhHours)} h pendientes
                    </span>
                  )}
                </div>

                <div className={styles.factCell}>
                  <span className={styles.factLabel}>Responsable</span>
                  {ticket.assignee ? (
                    <div className={styles.assigneeValue}>
                      <Avatar name={ticket.assignee.fullName} size={32} color="var(--kora-navy)" />
                      <span className={styles.factValue}>{ticket.assignee.fullName}</span>
                    </div>
                  ) : (
                    <span className={styles.factValueMuted}>Sin asignar</span>
                  )}
                </div>
                <div className={styles.factCell}>
                  <span className={styles.factLabel}>Horas extra</span>
                  {approvedOvertimeHours > 0 || pendingOvertimeHours > 0 ? (
                    <>
                      <span className={styles.factValue}>{formatHours(approvedOvertimeHours)} h aprobadas</span>
                      {pendingOvertimeHours > 0 && (
                        <span className={styles.factHint}>{formatHours(pendingOvertimeHours)} h pendientes</span>
                      )}
                    </>
                  ) : (
                    <span className={styles.factValueMuted}>Sin horas extra</span>
                  )}
                </div>
              </div>

              <div className={styles.contentCard}>
                <div className={styles.contentSection}>
                  <div className={styles.contentSectionHeader}>
                    <span className={styles.label}>
                      {ticketDescriptionLabel(ticket.serviceType)}
                    </span>
                    {!ticket.description && <span className={styles.emptyInline}>Sin descripción</span>}
                  </div>
                  {ticket.description && <ExpandableText text={ticket.description} />}
                </div>

                <div className={styles.contentSection}>
                  <div className={styles.contentSectionHeader}>
                    <span className={styles.label}>Evidencia</span>
                    {!ticket.evidenceUrl && <span className={styles.emptyInline}>Sin evidencia adjunta</span>}
                  </div>
                  {ticket.evidenceUrl &&
                    (isSafeHttpUrl(ticket.evidenceUrl) ? (
                      <a className={styles.link} href={ticket.evidenceUrl} target="_blank" rel="noreferrer">
                        <PaperclipIcon size={14} />
                        <span>{ticket.evidenceUrl}</span>
                      </a>
                    ) : (
                      <p className={styles.text}>{ticket.evidenceUrl}</p>
                    ))}
                </div>

                <div className={styles.contentSection}>
                  <div className={styles.contentSectionHeader}>
                    <span className={styles.label}>Solución aplicada</span>
                    {!ticket.resolution && <span className={styles.emptyInline}>Sin solución registrada</span>}
                  </div>
                  {/* Igual que en la v1: acá siempre es de solo lectura — la solución se
                      pide al confirmar "Terminar Proceso"/"Marcar Terminado" (ver CompleteTicketDialog). */}
                  {ticket.resolution && <ExpandableText text={ticket.resolution} />}
                </div>
              </div>

              <TicketHhRequestsSection
                ticketId={ticket.id}
                canRequest={ticket.canRequestHh}
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
                  <span className={styles.label}>Historial del ticket</span>
                  <ChevronDownIcon size={18} className={historyOpen ? styles.historyChevronOpen : styles.historyChevron} />
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
            </div>

            {ticket.canManage && ticket.status !== 'closed' && (
              <div className={styles.footer}>
                {ticket.status !== 'done' && ticket.canDelete && (
                  <Button
                    variant="tertiary"
                    className={styles.deleteButton}
                    iconLeft={<TrashIcon size={16} />}
                    onClick={() => setDeleteOpen(true)}
                  >
                    Eliminar ticket
                  </Button>
                )}
                <div className={styles.footerRight}>
                  {ticket.status !== 'done' && ticket.canEditDetails && (
                    <Button variant="outline" onClick={() => setEditOpen(true)}>
                      Editar
                    </Button>
                  )}
                  {forwardStatus && (
                    <Button
                      variant="primary"
                      disabled={isUnassignedPending}
                      title={isUnassignedPending ? 'Asigna un responsable para iniciar el ticket.' : undefined}
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
