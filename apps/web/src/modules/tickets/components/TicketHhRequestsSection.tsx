import { useMemo, useState } from 'react';
import { TICKET_HH_REQUEST_STATUS_LABELS, type TicketHhRequest } from '@kora/contracts';
import styles from './TicketHhRequestsSection.module.css';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ClockIcon, PlusIcon } from '@/shared/components/icons/Icons';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import {
  useApproveTicketHhRequest,
  useCreateTicketHhRequest,
  useRejectTicketHhRequest,
  useTicketHhRequestsList,
} from '../api/ticket-hh-requests.queries';
import { computeApprovedHhBreakdown } from '../lib/ticket-hh-breakdown';

const STATUS_TONE: Record<TicketHhRequest['status'], BadgeTone> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const todayIso = () => new Date().toISOString().slice(0, 10);

interface TicketHhRequestsSectionProps {
  ticketId: string;
  /** `ticket.canRequestHh` — responsable o autoridad del proyecto, ticket no cerrado y con proyecto asociado (ver `GetTicketUseCase`). */
  canRequest: boolean;
  /** `ticket.allowsOvertime` — el líder debe autorizar el ticket antes de poder marcar una solicitud como horas extra. */
  allowsOvertime: boolean;
  /** `ticket.pendingHhRequestsCount` / `ticket.pendingHhHours` — para avisar en el encabezado sin esperar a que cargue la lista. */
  pendingHhRequestsCount: number;
  pendingHhHours: number;
}

/**
 * Solicitud de horas desde un ticket — "siguiente paso de M5", ver
 * docs/DECISION-M5-TICKETS.md. Pedir horas, aprobarlas (genera un registro de
 * horas ya aprobado) o rechazarlas, todo dentro de la misma ficha modal.
 */
export function TicketHhRequestsSection({
  ticketId,
  canRequest,
  allowsOvertime,
  pendingHhRequestsCount,
  pendingHhHours,
}: TicketHhRequestsSectionProps) {
  const { can } = usePermissions();
  const toast = useToast();
  const { data: requests, isLoading } = useTicketHhRequestsList(ticketId);
  const createRequest = useCreateTicketHhRequest(ticketId);
  const approveRequest = useApproveTicketHhRequest(ticketId);
  const rejectRequest = useRejectTicketHhRequest(ticketId);

  const [date, setDate] = useState(todayIso());
  const [hours, setHours] = useState('');
  const [note, setNote] = useState('');
  const [isOvertime, setIsOvertime] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const canApprove = can('hours:approve');

  /** "HH cargadas por colaborador" de la v1 — vive de las mismas solicitudes ya cargadas, filtradas a aprobadas. */
  const approvedBreakdown = useMemo(() => computeApprovedHhBreakdown(requests), [requests]);
  const approvedTotal = approvedBreakdown.reduce((sum, user) => sum + user.hours, 0);

  const submitRequest = async () => {
    const hoursValue = Number(hours);
    if (!(hoursValue > 0)) return;
    await createRequest.mutateAsync({ date, hours: hoursValue, note: note.trim() || undefined, isOvertime });
    toast.success('Solicitud de horas enviada.');
    setHours('');
    setNote('');
    setIsOvertime(false);
  };

  const approve = async (requestId: string) => {
    await approveRequest.mutateAsync(requestId);
    toast.success('Solicitud aprobada — se generó el registro de horas.');
  };

  const submitReject = async (requestId: string) => {
    if (!rejectionReason.trim()) return;
    await rejectRequest.mutateAsync({ requestId, input: { reason: rejectionReason.trim() } });
    toast.success('Solicitud rechazada.');
    setRejectingId(null);
    setRejectionReason('');
  };

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.label}>Solicitudes de HH</span>
        {pendingHhRequestsCount > 0 && (
          <span className={styles.pendingChip} title={`${pendingHhRequestsCount} solicitud(es) pendientes de aprobar`}>
            <ClockIcon size={12} />
            {formatHours(pendingHhHours)}h por aprobar
          </span>
        )}
      </div>

      {approvedBreakdown.length > 0 && (
        <div className={styles.breakdown}>
          <span className={styles.breakdownTotal}>HH cargadas por colaborador: {formatHours(approvedTotal)}hrs en total</span>
          {approvedBreakdown.map((user) => (
            <div key={user.userId} className={styles.breakdownRow}>
              <span>{user.fullName}</span>
              <span>{formatHours(user.hours)}hrs</span>
            </div>
          ))}
        </div>
      )}

      {canRequest && (
        <div className={styles.form}>
          <span className={styles.formTitle}>Nueva solicitud de horas</span>
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
            <TextField label="Nota (opcional)" value={note} onChange={(event) => setNote(event.target.value)} />
          </div>
          <div className={styles.formFooter}>
            <label
              className={[styles.overtimeToggleRow, !allowsOvertime ? styles.overtimeToggleRowDisabled : ''].filter(Boolean).join(' ')}
              title={allowsOvertime ? undefined : 'Este ticket no tiene autorizadas horas extra.'}
            >
              <input
                type="checkbox"
                className={styles.overtimeCheckbox}
                disabled={!allowsOvertime}
                checked={isOvertime}
                onChange={(event) => setIsOvertime(event.target.checked)}
              />
              <span className={styles.overtimeSwitch} />
              <span>Horas extra</span>
            </label>
            <Button loading={createRequest.isPending} iconLeft={<PlusIcon size={16} />} onClick={() => void submitRequest()}>
              Enviar solicitud
            </Button>
          </div>
        </div>
      )}

      <div className={styles.list}>
        {isLoading && <span className={styles.empty}>Cargando…</span>}
        {!isLoading && (requests?.length ?? 0) === 0 && <span className={styles.empty}>Sin solicitudes todavía.</span>}
        {requests?.map((request) => (
          <div key={request.id} className={styles.item}>
            <div className={styles.itemRow}>
              <span className={styles.itemMain}>
                {request.hours}h — {formatDate(request.date)} · {request.user.fullName}
              </span>
              {request.isOvertime && <Badge tone="warning">Extra</Badge>}
              <Badge tone={STATUS_TONE[request.status]}>{TICKET_HH_REQUEST_STATUS_LABELS[request.status]}</Badge>
            </div>
            {request.note && <p className={styles.itemNote}>{request.note}</p>}
            {request.status === 'rejected' && request.rejectionReason && (
              <p className={styles.itemRejection}>Motivo: {request.rejectionReason}</p>
            )}
            {request.status !== 'pending' && request.reviewedBy && (
              <p className={styles.itemMeta}>
                {TICKET_HH_REQUEST_STATUS_LABELS[request.status]} por {request.reviewedBy.fullName}
                {request.reviewedAt ? ` · ${formatDateTime(request.reviewedAt)}` : ''}
              </p>
            )}

            {request.status === 'pending' && canApprove && (
              <div className={styles.actions}>
                <Button size="sm" loading={approveRequest.isPending} onClick={() => void approve(request.id)}>
                  Aprobar
                </Button>
                {rejectingId === request.id ? (
                  <>
                    <TextField
                      className={styles.rejectionInput}
                      placeholder="Motivo del rechazo"
                      value={rejectionReason}
                      onChange={(event) => setRejectionReason(event.target.value)}
                    />
                    <Button
                      variant="dangerOutline"
                      size="sm"
                      loading={rejectRequest.isPending}
                      onClick={() => void submitReject(request.id)}
                    >
                      Confirmar rechazo
                    </Button>
                  </>
                ) : (
                  <Button variant="dangerOutline" size="sm" onClick={() => setRejectingId(request.id)}>
                    Rechazar
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
