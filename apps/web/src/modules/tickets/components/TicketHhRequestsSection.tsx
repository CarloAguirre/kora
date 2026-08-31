import { useState } from 'react';
import { TICKET_HH_REQUEST_STATUS_LABELS, type TicketHhRequest } from '@kora/contracts';
import styles from './TicketHhRequestsSection.module.css';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
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

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');
const formatDateTime = (value: string) => new Date(value).toLocaleString('es-CL');
const todayIso = () => new Date().toISOString().slice(0, 10);

interface TicketHhRequestsSectionProps {
  ticketId: string;
  /** Solo se puede solicitar si el ticket tiene un proyecto asociado. */
  canRequest: boolean;
}

/**
 * Solicitud de horas desde un ticket — "siguiente paso de M5", ver
 * docs/DECISION-M5-TICKETS.md. Pedir horas, aprobarlas (genera un registro de
 * horas ya aprobado) o rechazarlas, todo dentro de la misma ficha modal.
 */
export function TicketHhRequestsSection({ ticketId, canRequest }: TicketHhRequestsSectionProps) {
  const { can } = usePermissions();
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

  const canApprove = can('hours:approve');

  const submitRequest = async () => {
    const hoursValue = Number(hours);
    if (!(hoursValue > 0)) return;
    await createRequest.mutateAsync({ date, hours: hoursValue, note: note.trim() || undefined });
    toast.success('Solicitud de horas enviada.');
    setHours('');
    setNote('');
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
        <span className={styles.label}>Solicitudes de HH:</span>
      </div>

      {canRequest && (
        <div className={styles.form}>
          <TextField label="Fecha" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <TextField label="Horas" type="number" min="0.5" max="24" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} />
          <TextField label="Nota (opcional)" value={note} onChange={(event) => setNote(event.target.value)} />
          <Button size="sm" loading={createRequest.isPending} onClick={() => void submitRequest()}>
            Enviar solicitud
          </Button>
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
