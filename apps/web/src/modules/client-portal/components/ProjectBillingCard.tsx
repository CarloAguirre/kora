import styles from './ProjectBillingCard.module.css';
import type { ClientProjectBilling } from '../types';

const formatCurrency = (value: number) => `$${value.toLocaleString('es-CL', { maximumFractionDigits: 0 })}`;

const STATUS_LABEL: Readonly<Record<'paid' | 'pending', string>> = {
  paid: 'Pagada',
  pending: 'Pendiente',
};

/**
 * "Facturación" — sección nueva del proyecto (Figma node 9663:24480, variante
 * "Kora · Proyectos y Soporte 2"). Distinta de la facturación de un contrato
 * de soporte (`ClientSupportContractRow`): esto es el cronograma de pago DEL
 * PROYECTO por tramos, no de un plan de soporte.
 */
export function ProjectBillingCard({ billing }: { billing: ClientProjectBilling }) {
  const paidWidth = billing.paid.percent;
  const pendingCollectionWidth = billing.invoicedPendingCollection.percent;
  const pendingToInvoiceWidth = billing.pendingToInvoice.percent;

  return (
    <div className={styles.card}>
      <div className={styles.kpiRow}>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Total del contrato</span>
          <span className={styles.kpiValue}>{formatCurrency(billing.totalAmount)}</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Pagado</span>
          <span className={[styles.kpiValue, styles.kpiValuePaid].join(' ')}>{formatCurrency(billing.paid.amount)}</span>
          <span className={styles.kpiSub}>{billing.paid.percent}% del contrato</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Facturado, por cobrar</span>
          <span className={[styles.kpiValue, styles.kpiValuePendingCollection].join(' ')}>{formatCurrency(billing.invoicedPendingCollection.amount)}</span>
          <span className={styles.kpiSub}>{billing.invoicedPendingCollection.percent}% del contrato</span>
        </div>
        <div className={styles.kpi}>
          <span className={styles.kpiLabel}>Pendiente de facturar</span>
          <span className={styles.kpiValue}>{formatCurrency(billing.pendingToInvoice.amount)}</span>
          <span className={styles.kpiSub}>{billing.pendingToInvoice.percent}% del contrato</span>
        </div>
      </div>

      <div className={styles.progressTrack}>
        <div className={styles.progressPaid} style={{ width: `${paidWidth}%` }} />
        <div className={styles.progressPendingCollection} style={{ width: `${pendingCollectionWidth}%` }} />
        <div className={styles.progressPendingToInvoice} style={{ width: `${pendingToInvoiceWidth}%` }} />
      </div>

      <div className={styles.legendRow}>
        <span className={styles.legendItem}>
          <span className={[styles.legendDot, styles.legendDotPaid].join(' ')} />
          Pagado — {formatCurrency(billing.paid.amount)} ({billing.paid.percent}%)
        </span>
        <span className={styles.legendItem}>
          <span className={[styles.legendDot, styles.legendDotPendingCollection].join(' ')} />
          Facturado, por cobrar — {formatCurrency(billing.invoicedPendingCollection.amount)} ({billing.invoicedPendingCollection.percent}%)
        </span>
        <span className={styles.legendItem}>
          <span className={[styles.legendDot, styles.legendDotPendingToInvoice].join(' ')} />
          Pendiente de facturar — {formatCurrency(billing.pendingToInvoice.amount)} ({billing.pendingToInvoice.percent}%)
        </span>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th>Tramo</th>
            <th>% del proyecto</th>
            <th>Monto</th>
            <th>N° Factura</th>
            <th>Fecha emisión</th>
            <th>Estado</th>
            <th>Fecha de pago</th>
          </tr>
        </thead>
        <tbody>
          {billing.schedule.map((row) => (
            <tr key={row.tramo}>
              <td className={styles.tramoCell}>{row.tramo}</td>
              <td>{row.percent}%</td>
              <td className={styles.amountCell}>{formatCurrency(row.amount)}</td>
              <td>{row.invoiceNumber ?? '—'}</td>
              <td>{row.issueDate ?? '—'}</td>
              <td>
                <span className={[styles.statusBadge, row.status === 'paid' ? styles.statusBadgePaid : styles.statusBadgePending].join(' ')}>
                  {STATUS_LABEL[row.status]}
                </span>
              </td>
              <td>{row.paymentDate ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
