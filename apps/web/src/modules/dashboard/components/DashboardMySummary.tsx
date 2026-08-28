import type { DashboardApprovalsSummary, DashboardHoursSummary, DashboardTicketsSummary } from '@kora/contracts';
import styles from './DashboardMySummary.module.css';
import { Card } from '@/shared/components/ui/Card';
import { ClockIcon, CheckIcon, TicketIcon } from '@/shared/components/icons/Icons';

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

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
  if (!loading && !hours && !approvals && !tickets) return null;

  return (
    <div className={styles.row}>
      {(loading || hours) && (
        <Card className={styles.card}>
          <div className={styles.labelRow}>
            <ClockIcon size={16} />
            <span className={styles.label}>Mis Horas Esta Semana</span>
          </div>
          <span className={styles.value}>{loading ? '…' : `${formatHours(hours?.weekHours ?? 0)} / ${hours?.weekTargetHours ?? 0} hrs`}</span>
          {!!hours && hours.rejectedCount > 0 && <span className={styles.sub}>{hours.rejectedCount} registros rechazados</span>}
        </Card>
      )}

      {(loading || approvals) && (
        <Card className={styles.card}>
          <div className={styles.labelRow}>
            <CheckIcon size={16} />
            <span className={styles.label}>Aprobaciones Pendientes</span>
          </div>
          <span className={styles.value}>{loading ? '…' : (approvals?.pendingCount ?? 0)}</span>
        </Card>
      )}

      {(loading || tickets) && (
        <Card className={styles.card}>
          <div className={styles.labelRow}>
            <TicketIcon size={16} />
            <span className={styles.label}>{tickets?.scope === 'own' ? 'Mis Tickets Abiertos' : 'Tickets Abiertos'}</span>
          </div>
          <span className={styles.value}>{loading ? '…' : (tickets?.openCount ?? 0)}</span>
        </Card>
      )}
    </div>
  );
}
