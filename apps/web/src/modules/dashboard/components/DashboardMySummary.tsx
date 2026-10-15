import { Link, useNavigate } from 'react-router-dom';
import { TICKET_STATUS_LABELS, type DashboardApprovalsSummary, type DashboardHoursSummary, type DashboardTicketsSummary } from '@kora/contracts';
import styles from './DashboardMySummary.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { ClockIcon, CheckIcon, TicketIcon, ChevronRightIcon } from '@/shared/components/icons/Icons';
import { SegmentedBar } from '@/shared/components/ui/SegmentedBar';
import { CATEGORICAL_CHART_COLORS } from '@/shared/lib/chart-colors';
import { ticketPath } from '@/app/router/paths';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

function formatDaysAgo(iso: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
  if (days === 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  return `hace ${days} días`;
}

/** Mismos colores que las etiquetas de estado del tablero de Tickets (`TicketStatusBadge`) — la identidad de color ya la conoce el usuario. */
const TICKET_STATUS_COLORS: Record<string, string> = {
  pending: '#c34400',
  in_progress: '#19738c',
  in_testing: '#ee7e23',
  done: '#4e7511',
  closed: '#5a6470',
};

interface DashboardMySummaryProps {
  hours: DashboardHoursSummary | null;
  approvals: DashboardApprovalsSummary | null;
  tickets: DashboardTicketsSummary | null;
  loading: boolean;
}

/**
 * "Mi resumen" — datos personales del actor (horas de la semana, aprobaciones
 * pendientes, tickets propios) que ya calculaba el backend pero la página no
 * mostraba. Cada tarjeta solo aparece si el actor tiene el permiso asociado
 * (sección `null` desde el caso de uso), así que un colaborador o comercial
 * ve contenido propio en vez de un Dashboard casi vacío.
 */
export function DashboardMySummary({ hours, approvals, tickets, loading }: DashboardMySummaryProps) {
  const navigate = useNavigate();
  if (!loading && !hours && !approvals && !tickets) return null;

  return (
    <div className={styles.row}>
      {(loading || hours) && (
        <Card className={styles.card}>
          <div className={styles.labelRow}>
            <div className={styles.labelGroup}>
              <ClockIcon size={16} />
              <span className={styles.label}>Mis Horas Esta Semana</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Ir a Mis Horas" onClick={() => navigate('/horas')}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
          <span className={styles.value}>{loading ? '…' : `${formatHours(hours?.weekHours ?? 0)} / ${hours?.weekTargetHours ?? 0} hrs`}</span>
          {!!hours && hours.weekOvertimeHours > 0 && (
            <span className={styles.sub}>Incluye {formatHours(hours.weekOvertimeHours)} h extra</span>
          )}
          {!!hours && hours.rejectedCount > 0 && <span className={styles.sub}>{hours.rejectedCount} registros rechazados</span>}
        </Card>
      )}

      {(loading || approvals) && (
        <Card className={styles.card}>
          <div className={styles.labelRow}>
            <div className={styles.labelGroup}>
              <CheckIcon size={16} />
              <span className={styles.label}>Aprobaciones Pendientes</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Ir a Aprobaciones" onClick={() => navigate('/horas/aprobaciones')}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
          <span className={styles.value}>{loading ? '…' : (approvals?.pendingCount ?? 0)}</span>
          {!!approvals && approvals.pendingByTeam.length > 0 && (
            <>
              <SegmentedBar
                segments={approvals.pendingByTeam.map((team, index) => ({
                  key: team.teamId ?? 'none',
                  value: team.pendingCount,
                  color: CATEGORICAL_CHART_COLORS[index % CATEGORICAL_CHART_COLORS.length]!,
                  label: team.teamName ?? 'Sin equipo',
                }))}
              />
              <div className={styles.breakdown}>
                {approvals.pendingByTeam.map((team, index) => (
                  <span key={team.teamId ?? 'none'} className={styles.breakdownItem}>
                    <span
                      className={styles.dot}
                      style={{ background: CATEGORICAL_CHART_COLORS[index % CATEGORICAL_CHART_COLORS.length] }}
                    />
                    {team.teamName ?? 'Sin equipo'}: <strong>{team.pendingCount}</strong>
                  </span>
                ))}
              </div>
            </>
          )}
        </Card>
      )}

      {(loading || tickets) && (
        <Card className={styles.card}>
          <div className={styles.labelRow}>
            <div className={styles.labelGroup}>
              <TicketIcon size={16} />
              <span className={styles.label}>{tickets?.scope === 'own' ? 'Mis Tickets Abiertos' : 'Tickets Abiertos'}</span>
            </div>
            <Button variant="ghost" size="icon" aria-label="Ir a Tickets" onClick={() => navigate('/tickets')}>
              <ChevronRightIcon size={16} />
            </Button>
          </div>
          <span className={styles.value}>{loading ? '…' : (tickets?.openCount ?? 0)}</span>
          {!!tickets && tickets.byStatus.length > 0 && (
            <>
              <SegmentedBar
                segments={tickets.byStatus.map((entry) => ({
                  key: entry.status,
                  value: entry.count,
                  color: TICKET_STATUS_COLORS[entry.status] ?? '#5a6470',
                  label: TICKET_STATUS_LABELS[entry.status],
                }))}
              />
              <div className={styles.breakdown}>
                {tickets.byStatus.map((entry) => (
                  <span key={entry.status} className={styles.breakdownItem}>
                    <span className={styles.dot} style={{ background: TICKET_STATUS_COLORS[entry.status] ?? '#5a6470' }} />
                    {TICKET_STATUS_LABELS[entry.status]}: <strong>{entry.count}</strong>
                  </span>
                ))}
              </div>
            </>
          )}
          {!!tickets?.oldestOpenTicket && (
            <Link to={ticketPath(tickets.oldestOpenTicket)} className={styles.oldestLink}>
              Más antiguo: {tickets.oldestOpenTicket.title} · {formatDaysAgo(tickets.oldestOpenTicket.createdAt)}
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
