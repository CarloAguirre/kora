import { useState } from 'react';
import { TICKET_HH_REQUEST_STATUS_LABELS, type TicketHhRequest } from '@kora/contracts';
import styles from './TicketHhRequestsSection.module.css';
import { Avatar } from '@/shared/components/ui/Avatar';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { CheckIcon, ChevronDownIcon, InfoIcon, PlusIcon, TriangleAlertIcon } from '@/shared/components/icons/Icons';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { ApiRequestError } from '@/shared/lib/api-client';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { useHourEntriesList } from '@/modules/hours/api/hours.queries';
import {
  useApproveTicketHhRequest,
  useCreateTicketHhRequest,
  useRejectTicketHhRequest,
  useTicketHhRequestsList,
} from '../api/ticket-hh-requests.queries';

const STATUS_TONE: Record<TicketHhRequest['status'], BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const DAILY_CAP_HOURS = 8;
const AVATAR_COLOR = 'var(--kora-navy)';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const todayIso = () => new Date().toISOString().slice(0, 10);

/** "13-10-2026 · Horas normales · Revisión de logs" — la línea secundaria de cada solicitud. */
function requestMeta(request: TicketHhRequest): string {
  return [formatDate(request.date), request.isOvertime ? 'Horas extra' : 'Horas normales', request.note]
    .filter(Boolean)
    .join(' · ');
}

interface TicketHhRequestsSectionProps {
  ticketId: string;
  /** `ticket.canRequestHh` — responsable o autoridad del proyecto, ticket no cerrado y con proyecto asociado (ver `GetTicketUseCase`). */
  canRequest: boolean;
  /** `ticket.pendingHhRequestsCount` / `ticket.pendingHhHours` — para avisar en el encabezado sin esperar a que cargue la lista. */
  pendingHhRequestsCount: number;
  pendingHhHours: number;
  /** `ticket.hhApprovers` — quién(es) decidirán la solicitud (líder de equipo del responsable, o líder de proyecto a falta de ese líder). */
  hhApprovers: { id: string; fullName: string }[];
}

/**
 * Solicitud de horas desde un ticket — "siguiente paso de M5", ver
 * docs/DECISION-M5-TICKETS.md. Dos tarjetas: "Horas por aprobar" (aprobar —
 * genera un registro de horas ya aprobado — o rechazar, más el historial de
 * solicitudes resueltas) y "Registrar horas" (pedir horas), todo dentro de la
 * misma ficha modal.
 */
export function TicketHhRequestsSection({
  ticketId,
  canRequest,
  pendingHhRequestsCount,
  pendingHhHours,
  hhApprovers,
}: TicketHhRequestsSectionProps) {
  const { can } = usePermissions();
  const { user } = useAuth();
  const toast = useToast();
  const { data: requests, isLoading } = useTicketHhRequestsList(ticketId);
  const createRequest = useCreateTicketHhRequest(ticketId);
  const approveRequest = useApproveTicketHhRequest(ticketId);
  const rejectRequest = useRejectTicketHhRequest(ticketId);

  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [resolvedOpen, setResolvedOpen] = useState(false);

  const canApprove = can('hours:approve');
  const pendingRequests = (requests ?? []).filter((request) => request.status === 'pending');
  const resolvedRequests = (requests ?? []).filter((request) => request.status !== 'pending');

  /**
   * Soporte no exige autorizar horas extra: lo que pase de la jornada de 8h se
   * registra solo como horas extra (lo decide `CreateTicketHhRequestUseCase`
   * en el backend; esto es solo para avisar antes de enviar). Solo cuentan las
   * horas normales no rechazadas del usuario ese día — incluye las solicitudes
   * pendientes de cualquier ticket, que ya viven como `hour_entries` pendientes.
   */
  const { data: entriesForDate } = useHourEntriesList(user ? { userId: user.id, dateFrom: date, dateTo: date, pageSize: 100 } : {});
  const existingHoursForDate = (entriesForDate?.items ?? [])
    .filter((entry) => entry.status !== 'rejected' && !entry.isOvertime)
    .reduce((sum, entry) => sum + entry.hours, 0);
  const newHoursValue = Number(hours) || 0;
  const overtimeHoursPreview = Math.max(0, newHoursValue - Math.max(0, DAILY_CAP_HOURS - existingHoursForDate));

  const submitRequest = async () => {
    const hoursValue = Number(hours);
    if (!(hoursValue > 0)) return;
    try {
      await createRequest.mutateAsync({ date, hours: hoursValue, note: note.trim() || undefined });
      toast.success('Solicitud de horas enviada.');
      setHours('');
      setNote('');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo enviar la solicitud.');
    }
  };

  const approve = async (requestId: string) => {
    try {
      await approveRequest.mutateAsync(requestId);
      toast.success('Solicitud aprobada — se generó el registro de horas.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo aprobar la solicitud.');
    }
  };

  const cancelReject = () => {
    setRejectingId(null);
    setRejectionReason('');
  };

  const submitReject = async (requestId: string) => {
    if (!rejectionReason.trim()) return;
    try {
      await rejectRequest.mutateAsync({ requestId, input: { reason: rejectionReason.trim() } });
      toast.success('Solicitud rechazada.');
      cancelReject();
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo rechazar la solicitud.');
    }
  };

  return (
    <>
      <div className={styles.section}>
        <div className={styles.header}>
          <span className={styles.title}>Horas por aprobar</span>
          {pendingHhRequestsCount > 0 && (
            <span className={styles.pendingChip} title={`${pendingHhRequestsCount} solicitud(es) pendientes de aprobar`}>
              {formatHours(pendingHhHours)} h pendientes
            </span>
          )}
        </div>

        {isLoading && <span className={styles.empty}>Cargando…</span>}
        {!isLoading && pendingRequests.length === 0 && <span className={styles.empty}>Sin horas pendientes de aprobar.</span>}

        {pendingRequests.length > 0 && (
          <div className={styles.list}>
            {pendingRequests.map((request) => (
              <div key={request.id} className={styles.pendingItem}>
                <div className={styles.itemRow}>
                  <Avatar name={request.user.fullName} size={32} color={AVATAR_COLOR} />
                  <div className={styles.itemBody}>
                    <span className={styles.itemMain}>
                      {request.user.fullName} · {formatHours(request.hours)} h
                    </span>
                    <span className={styles.itemMeta}>{requestMeta(request)}</span>
                  </div>
                  {canApprove && rejectingId !== request.id && (
                    <div className={styles.actions}>
                      <Button variant="tertiary" size="sm" className={styles.rejectButton} onClick={() => setRejectingId(request.id)}>
                        Rechazar
                      </Button>
                      <Button
                        variant="outlineDark"
                        size="sm"
                        iconLeft={<CheckIcon size={14} />}
                        loading={approveRequest.isPending && approveRequest.variables === request.id}
                        disabled={approveRequest.isPending}
                        onClick={() => void approve(request.id)}
                      >
                        Aprobar
                      </Button>
                    </div>
                  )}
                </div>

                {rejectingId === request.id && (
                  <div className={styles.rejectRow}>
                    <TextField
                      className={styles.rejectionInput}
                      placeholder="Motivo del rechazo"
                      value={rejectionReason}
                      autoFocus
                      onChange={(event) => setRejectionReason(event.target.value)}
                    />
                    <Button variant="tertiary" size="sm" onClick={cancelReject}>
                      Cancelar
                    </Button>
                    <Button
                      variant="dangerOutline"
                      size="sm"
                      disabled={!rejectionReason.trim()}
                      loading={rejectRequest.isPending}
                      onClick={() => void submitReject(request.id)}
                    >
                      Confirmar rechazo
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {resolvedRequests.length > 0 && (
          <>
            <button
              type="button"
              className={styles.resolvedToggle}
              onClick={() => setResolvedOpen((open) => !open)}
              aria-expanded={resolvedOpen}
            >
              {resolvedOpen ? 'Ocultar' : 'Ver'} solicitudes resueltas ({resolvedRequests.length})
              <ChevronDownIcon size={14} className={resolvedOpen ? styles.chevronOpen : styles.chevron} />
            </button>
            {resolvedOpen && (
              <div className={styles.resolvedList}>
                {resolvedRequests.map((request) => (
                  <div key={request.id} className={styles.resolvedItem}>
                    <div className={styles.itemRow}>
                      <Avatar name={request.user.fullName} size={24} color={AVATAR_COLOR} />
                      <div className={styles.itemBody}>
                        <span className={styles.itemMain}>
                          {request.user.fullName} · {formatHours(request.hours)} h
                        </span>
                        <span className={styles.itemMeta}>{requestMeta(request)}</span>
                      </div>
                      <Badge tone={STATUS_TONE[request.status]}>{TICKET_HH_REQUEST_STATUS_LABELS[request.status]}</Badge>
                    </div>
                    {request.status === 'rejected' && request.rejectionReason && (
                      <p className={styles.itemRejection}>Motivo: {request.rejectionReason}</p>
                    )}
                    {request.reviewedBy && (
                      <p className={styles.itemReviewed}>
                        {TICKET_HH_REQUEST_STATUS_LABELS[request.status]} por {request.reviewedBy.fullName}
                        {request.reviewedAt ? ` · ${formatDateTime(request.reviewedAt)}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {canRequest && (
        <div className={styles.section}>
          <div className={styles.headerStack}>
            <span className={styles.title}>Registrar horas</span>
            <span className={styles.subtitle}>
              {hhApprovers.length > 0
                ? `Tus horas quedan pendientes hasta que las apruebe ${hhApprovers.map((approver) => approver.fullName).join(' o ')}.`
                : 'Este proyecto no tiene un aprobador definido para tu solicitud.'}
            </span>
          </div>

          {overtimeHoursPreview === 0 && existingHoursForDate > 0 && (
            <div className={styles.noticeInfo} role="status">
              <InfoIcon size={16} />
              <span>
                Ya tienes {formatHours(existingHoursForDate)} h registradas este día. Sobre {DAILY_CAP_HOURS} h se cuentan como
                horas extra.
              </span>
            </div>
          )}

          {overtimeHoursPreview > 0 && (
            <div className={styles.noticeWarning} role="status">
              <TriangleAlertIcon size={16} />
              <span>
                Superas las {DAILY_CAP_HOURS} h del día: {formatHours(overtimeHoursPreview)} h se registrarán como horas extra.
              </span>
            </div>
          )}

          <div className={styles.formGrid}>
            <TextField label="Fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            <TextField
              label="Horas"
              type="number"
              min="0.5"
              max="24"
              step="0.5"
              placeholder="0.0"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
            />
            <TextField
              label="Nota (opcional)"
              placeholder="¿En qué trabajaste?"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>

          <div className={styles.formFooter}>
            <Button
              variant="outlineDark"
              className={styles.submitButton}
              disabled={!(newHoursValue > 0)}
              loading={createRequest.isPending}
              iconLeft={<PlusIcon size={16} />}
              onClick={() => void submitRequest()}
            >
              Registrar horas
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
