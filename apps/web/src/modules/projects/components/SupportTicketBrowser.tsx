import { useEffect, useState, type ReactNode } from 'react';
import type { ListTicketsResponse } from '@kora/contracts';
import styles from './SupportTicketBrowser.module.css';
import { Badge } from '@/shared/components/ui/Badge';
import { Pagination } from '@/shared/components/ui/Pagination';
import { PaperclipIcon } from '@/shared/components/icons/Icons';
import { TicketPriorityBadge } from '@/modules/tickets/components/TicketPriorityBadge';
import { TicketStatusBadge } from '@/modules/tickets/components/TicketStatusBadge';
import { TicketDetailModal } from '@/modules/tickets/components/TicketDetailModal';
import { useTicketDetail } from '@/modules/tickets/api/tickets.queries';

const formatDate = (value: string) => new Date(value).toLocaleDateString('es-CL');

/** Enlaza solo si es http(s) — mismo criterio de seguridad que `TicketDetailModal`. */
function isSafeHttpUrl(value: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function evidenceFileName(url: string): string {
  try {
    const path = new URL(url).pathname;
    const name = path.split('/').pop();
    return name && name.length > 0 ? decodeURIComponent(name) : url;
  } catch {
    return url;
  }
}

export interface SupportTicketBrowserProps {
  tickets: ListTicketsResponse | undefined;
  loading: boolean;
  page: number;
  onPageChange: (page: number) => void;
}

/**
 * Lista de tickets + panel de detalle en línea, dos columnas — igual patrón
 * que el mockup de referencia (`kora-facturacion-soporte.html`). El código
 * del ticket abre `TicketDetailModal` (editar/cerrar/HH extra) para no
 * duplicar esas acciones acá — este panel es solo lectura.
 */
export function SupportTicketBrowser({ tickets, loading, page, onPageChange }: SupportTicketBrowserProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [managingId, setManagingId] = useState<string | null>(null);

  useEffect(() => {
    const items = tickets?.items ?? [];
    if (items.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!items.some((t) => t.id === selectedId)) {
      setSelectedId(items[0]!.id);
    }
    // Solo reacciona a que cambie el set de tickets, no a `selectedId` (evita re-evaluar en cada clic propio).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets]);

  if (loading) {
    return <p className={styles.hint}>Cargando tickets…</p>;
  }
  if (!tickets || tickets.items.length === 0) {
    return <p className={styles.hint}>Sin tickets registrados.</p>;
  }

  return (
    <>
      <div className={styles.browser}>
        <div className={styles.list}>
          {tickets.items.map((t) => (
            <button
              key={t.id}
              type="button"
              className={[styles.listItem, t.id === selectedId ? styles.listItemActive : ''].filter(Boolean).join(' ')}
              onClick={() => setSelectedId(t.id)}
            >
              <span className={styles.listItemCode}>{t.code ?? '—'}</span>
              <span className={styles.listItemTitle}>{t.title}</span>
              <span className={styles.listItemBadges}>
                <Badge tone={t.invoiceId ? 'info' : 'warning'}>{t.invoiceId ? 'Facturado' : 'Por facturar'}</Badge>
                <TicketStatusBadge status={t.status} />
              </span>
            </button>
          ))}
        </div>

        <div className={styles.detail}>
          {selectedId && <TicketDetailPane ticketId={selectedId} onManage={() => setManagingId(selectedId)} />}
        </div>
      </div>

      {tickets.total > 0 && (
        <Pagination page={page} pageCount={tickets.pageCount} total={tickets.total} pageSize={tickets.pageSize} onPageChange={onPageChange} />
      )}

      {managingId && <TicketDetailModal ticketId={managingId} onClose={() => setManagingId(null)} />}
    </>
  );
}

function TicketDetailPane({ ticketId, onManage }: { ticketId: string; onManage: () => void }) {
  const { data: ticket, isLoading } = useTicketDetail(ticketId);

  if (isLoading || !ticket) {
    return <div className={styles.detailCard}><p className={styles.hint}>Cargando ticket…</p></div>;
  }

  return (
    <div className={styles.detailCard}>
      <div className={styles.detailHead}>
        <div>
          <button type="button" className={styles.detailTitleLink} onClick={onManage}>
            {ticket.code ?? '—'} · {ticket.title}
          </button>
          <p className={styles.detailSub}>Responsable: {ticket.assignee?.fullName ?? 'Sin asignar'}</p>
        </div>
        <Badge tone={ticket.invoiceId ? 'info' : 'warning'}>{ticket.invoiceId ? 'Facturado' : 'Por facturar'}</Badge>
      </div>

      <div className={styles.detailGrid}>
        <DetailField label="Reporte" value={formatDate(ticket.createdAt)} />
        <DetailField label="Estimadas" value={ticket.estimatedHours !== null ? `${ticket.estimatedHours}h` : '—'} />
        <DetailField label="Prioridad" value={<TicketPriorityBadge priority={ticket.priority} />} />
        <DetailField label="Solución" value={ticket.resolvedAt ? formatDate(ticket.resolvedAt) : '—'} />
        <DetailField label="Utilizadas" value={`${ticket.usedHours}h`} />
      </div>

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Descripción del incidente</p>
        <p className={styles.detailText}>{ticket.description ?? 'Sin descripción.'}</p>
      </div>

      {ticket.evidenceUrl && (
        <div className={styles.detailSection}>
          <p className={styles.detailSectionTitle}>Documentos de evidencia</p>
          {isSafeHttpUrl(ticket.evidenceUrl) ? (
            <a className={styles.evidenceChip} href={ticket.evidenceUrl} target="_blank" rel="noreferrer">
              <PaperclipIcon size={13} />
              {evidenceFileName(ticket.evidenceUrl)}
            </a>
          ) : (
            <span className={styles.evidenceChip}>
              <PaperclipIcon size={13} />
              {ticket.evidenceUrl}
            </span>
          )}
        </div>
      )}

      <div className={styles.detailSection}>
        <p className={styles.detailSectionTitle}>Historial del ticket</p>
        {ticket.history.length === 0 ? (
          <p className={styles.detailText}>Sin eventos todavía.</p>
        ) : (
          <ul className={styles.historyList}>
            {ticket.history.map((entry) => (
              <li key={entry.id} className={styles.historyItem}>
                <span className={styles.historyDate}>{formatDate(entry.occurredAt)}</span> {entry.description}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.detailField}>
      <span className={styles.detailFieldLabel}>{label}</span>
      <span className={styles.detailFieldValue}>{value}</span>
    </div>
  );
}
