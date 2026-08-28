import { useEffect, useState } from 'react';
import {
  TICKET_PRIORITY_LABELS,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_ORDER,
  TICKET_STATUSES,
  nextForwardTicketStatus,
  type TicketDetail,
  type TicketStatus,
} from '@kora/contracts';
import styles from './TicketDetailModal.module.css';
import priorityStyles from './TicketPriorityBadge.module.css';
import { Select } from '@/shared/components/ui/Select';
import { Button } from '@/shared/components/ui/Button';
import { AlertIcon, CalendarIcon, ClockIcon, CloseIcon, SparklesIcon } from '@/shared/components/icons/Icons';
import { TicketStatusBadge } from './TicketStatusBadge';
import { TicketHhRequestsSection } from './TicketHhRequestsSection';
import { useChangeTicketStatus, useTicketDetail, useUpdateTicket } from '../api/tickets.queries';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';

const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const formatDate = (value: string) => new Date(value).toLocaleDateString('es-CL');

/**
 * Opciones habilitadas del selector de estado: el estado actual, cualquier
 * retroceso (reapertura libre, sin validar) y únicamente el siguiente paso
 * legal del avance forzado — el resto queda deshabilitado. Ver
 * `nextForwardTicketStatus` en @kora/contracts.
 */
function buildStatusOptions(ticket: TicketDetail) {
  const legalNext = nextForwardTicketStatus(ticket.status, ticket.serviceType);
  return TICKET_STATUSES.map((status) => {
    const isCurrent = status === ticket.status;
    const isBackward = TICKET_STATUS_ORDER[status] < TICKET_STATUS_ORDER[ticket.status];
    const isLegalForward = status === legalNext;
    return { value: status, label: TICKET_STATUS_LABELS[status], disabled: !isCurrent && !isBackward && !isLegalForward };
  });
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
  const forbidden = error instanceof ApiRequestError && error.isForbidden;

  const [resolutionDraft, setResolutionDraft] = useState('');
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
              {can('tickets:manage') ? (
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
              ) : ticket.resolution ? (
                <p className={styles.text}>{ticket.resolution}</p>
              ) : (
                <span className={styles.empty}>Sin solución registrada</span>
              )}
            </div>

            <div className={styles.section}>
              <TicketHhRequestsSection ticketId={ticketId} canRequest={can('hours:register') && Boolean(ticket.project)} />
            </div>

            <div className={styles.divider} />

            <div className={styles.section}>
              <span className={styles.label}>Bitácora:</span>
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
            </div>

            <div className={styles.divider} />

            {can('tickets:manage') && (
              <div className={styles.footer}>
                <Select
                  className={styles.statusSelect}
                  label="Cambiar estado"
                  options={buildStatusOptions(ticket)}
                  value={ticket.status}
                  onChange={(event) => void onStatusChange(event.target.value as TicketStatus)}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
