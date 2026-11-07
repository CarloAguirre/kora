import type { SupportMonthlyBillingPeriod, SupportPlanCurrency } from '@kora/contracts';
import styles from '../pages/SupportPlanDetailPage.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { formatMoney } from '@/shared/lib/format-money';

const formatDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString('es-CL');

/** "Octubre 2026" a partir de 'YYYY-MM'. */
export function formatPeriodMonth(periodKey: string): string {
  const [year, month] = periodKey.split('-').map(Number);
  const label = new Date(year!, month! - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(' de ', ' ');
}

/** El fin del período es exclusivo — se muestra el último día incluido. */
function lastIncludedDay(endDate: string): string {
  const day = new Date(`${endDate}T00:00:00`);
  day.setDate(day.getDate() - 1);
  return day.toLocaleDateString('es-CL');
}

function StatusCell({ period }: { period: SupportMonthlyBillingPeriod }) {
  if (period.status === 'invoiced') {
    return (
      <span className={styles.folioCell}>
        <Badge tone="info">Facturado</Badge>
        {period.invoices.length > 0 && (
          <span className={styles.folioSub}>
            {period.invoices.length === 1 ? 'Folio' : 'Folios'} {period.invoices.map((invoice) => invoice.folio).join(', ')}
          </span>
        )}
      </span>
    );
  }
  if (period.status === 'upcoming') {
    return (
      <span className={styles.folioCell}>
        <Badge tone="neutral">Próximo</Badge>
        <span className={styles.folioSub}>Se puede facturar desde el {formatDate(period.startDate)}</span>
      </span>
    );
  }
  return <Badge tone="warning">{period.isCurrent ? 'Por facturar' : 'Sin factura'}</Badge>;
}

export interface SupportMonthlyBillingScheduleProps {
  periods: SupportMonthlyBillingPeriod[];
  currency: SupportPlanCurrency;
  canManageBilling: boolean;
  onIssue: (period: SupportMonthlyBillingPeriod) => void;
}

/**
 * Calendario de facturación de un contrato mensual: un mes por fila, del
 * primero al último del contrato. Cada mes se factura cuando empieza; los
 * meses ya cerrados que quedaron sin factura también se pueden registrar
 * desde acá. Los montos de los meses futuros son la cuota estimada.
 */
export function SupportMonthlyBillingSchedule({ periods, currency, canManageBilling, onIssue }: SupportMonthlyBillingScheduleProps) {
  const { pageItems, pagination } = usePaginatedItems(periods);
  const columns: Column<SupportMonthlyBillingPeriod>[] = [
    {
      key: 'month',
      header: 'Mes',
      render: (p) => (
        <span className={styles.folioCell}>
          {formatPeriodMonth(p.periodKey)}
          {p.isCurrent && ' (en curso)'}
          <span className={styles.folioSub}>
            {formatDate(p.startDate)} – {lastIncludedDay(p.endDate)}
          </span>
        </span>
      ),
    },
    { key: 'amount', header: 'Monto', align: 'right', render: (p) => formatMoney(p.amountUf, currency) },
    { key: 'status', header: 'Estado', render: (p) => <StatusCell period={p} /> },
    {
      key: 'actions',
      header: '',
      render: (p) =>
        p.status === 'to_invoice' && p.monthlyPeriodId && p.amountUf > 0 && canManageBilling ? (
          <Button variant="outline" size="sm" onClick={() => onIssue(p)}>
            Registrar factura
          </Button>
        ) : null,
    },
  ];

  return (
    <Card>
      <p className={styles.sectionTitle}>Meses del contrato</p>
      <DataTable
        caption="Meses del contrato"
        columns={columns}
        items={pageItems}
        getRowKey={(p) => p.periodKey}
        loading={false}
        error={null}
        emptyMessage="El contrato todavía no tiene meses para facturar."
      />

      <Pagination {...pagination} />
    </Card>
  );
}
