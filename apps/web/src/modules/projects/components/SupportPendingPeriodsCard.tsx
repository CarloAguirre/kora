import type { SupportInvoicePendingPeriod, SupportPlanCurrency } from '@kora/contracts';
import styles from '../pages/SupportPlanDetailPage.module.css';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { formatMoney } from '@/shared/lib/format-money';
import { formatPeriodMonth } from './SupportMonthlyBillingSchedule';

export interface SupportPendingPeriodsCardProps {
  periods: SupportInvoicePendingPeriod[];
  currency: SupportPlanCurrency;
  canManageBilling: boolean;
  onIssue: (period: SupportInvoicePendingPeriod) => void;
  onClosePeriod: (period: SupportInvoicePendingPeriod) => void;
}

/**
 * Meses "facturado parcial": ya tienen facturas, pero no cubren su total —
 * las que faltan se emiten después (p. ej. una cuota que el cliente paga en
 * partes). Desde acá se registran o se cierra el mes por lo facturado. Sin
 * meses pendientes, no se muestra.
 */
export function SupportPendingPeriodsCard({ periods, currency, canManageBilling, onIssue, onClosePeriod }: SupportPendingPeriodsCardProps) {
  if (periods.length === 0) return null;

  const columns: Column<SupportInvoicePendingPeriod>[] = [
    { key: 'month', header: 'Mes', render: (p) => formatPeriodMonth(p.periodKey) },
    {
      key: 'invoiced',
      header: 'Facturado',
      render: (p) => (
        <span className={styles.folioCell}>
          {formatMoney(p.invoicedAmountUf, currency)} de {formatMoney(p.totalAmountUf, currency)}
          <span className={styles.folioSub}>
            {p.invoices.length === 1 ? 'Folio' : 'Folios'} {p.invoices.map((invoice) => invoice.folio).join(', ')}
          </span>
        </span>
      ),
    },
    { key: 'pending', header: 'Saldo por facturar', align: 'right', render: (p) => <strong>{formatMoney(p.pendingAmountUf, currency)}</strong> },
    {
      key: 'actions',
      header: '',
      render: (p) =>
        canManageBilling ? (
          <span className={styles.invoiceActions}>
            <Button size="sm" onClick={() => onIssue(p)}>
              Registrar factura
            </Button>
            <Button variant="outline" size="sm" onClick={() => onClosePeriod(p)}>
              Cerrar mes
            </Button>
          </span>
        ) : null,
    },
  ];

  return (
    <Card>
      <p className={styles.sectionTitle}>Saldo por facturar</p>
      <DataTable
        caption="Meses facturados parcialmente"
        columns={columns}
        items={periods}
        getRowKey={(p) => p.periodKey}
        loading={false}
        error={null}
        emptyMessage=""
      />
    </Card>
  );
}
