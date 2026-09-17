import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupportBillingKpiGroup, SupportBillingRow } from '@kora/contracts';
import styles from './SupportBillingDashboardPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { KpiCard } from '@/shared/components/ui/KpiCard';
import { Select } from '@/shared/components/ui/Select';
import { Tabs } from '@/shared/components/ui/Tabs';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { TriangleAlertIcon } from '@/shared/components/icons/Icons';
import {
  SupportInvoiceBillingStatusBadge,
  SupportInvoicePaymentStatusBadge,
  SupportPlanScopeBadge,
  SupportPlanTypeBadge,
} from '@/modules/projects/components/SupportPlanBadges';
import { formatMoney } from '@/shared/lib/format-money';
import { useSupportBillingOverview } from '../api/billing.queries';

/** Fila vacía en UF para cuando aún no hay contratos activos ni carga en curso — mantiene el layout de 5 tarjetas de siempre. */
const EMPTY_KPI_GROUP: SupportBillingKpiGroup = {
  currency: 'UF',
  toInvoiceAmount: 0,
  toInvoiceCount: 0,
  invoicedAmount: 0,
  paidAmount: 0,
  overdueAmount: 0,
  overdueCount: 0,
};

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const YEAR_OPTIONS = [2025, 2026, 2027].map((y) => ({ value: String(y), label: String(y) }));
const MONTH_OPTIONS = MONTHS.map((label, i) => ({ value: String(i + 1), label }));

type TypeFilter = 'all' | 'on_demand' | 'bundle' | 'monthly';
const FILTERS: Readonly<{ id: TypeFilter; label: string }[]> = [
  { id: 'all', label: 'Todos' },
  { id: 'on_demand', label: 'A demanda' },
  { id: 'bundle', label: 'Bolsa' },
  { id: 'monthly', label: 'Mensual' },
];

function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Panel de Facturación de Soporte — una fila por contrato activo en el
 * período seleccionado, más los KPIs agregados. Regla obligatoria del
 * backend (`GetSupportBillingOverviewUseCase`): solo el período en curso
 * calcula un monto en vivo; cualquier otro período muestra solo facturas que
 * existen de verdad, para no inventar deuda al mirar un mes viejo.
 *
 * Simplificación respecto al prototipo de referencia: cada fila navega a la
 * ficha del contrato (`SupportPlanDetailPage`) en vez de abrir un panel
 * lateral aparte — evita duplicar ahí las mismas acciones de facturar/pagar.
 */
export function SupportBillingDashboardPage() {
  const [{ year, month }, setPeriod] = useState(currentPeriod());
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  const period = `${year}-${String(month).padStart(2, '0')}`;
  const { data: overview, isLoading } = useSupportBillingOverview(period);

  const changeMonth = (delta: number) => {
    setPeriod((prev) => {
      let nextMonth = prev.month + delta;
      let nextYear = prev.year;
      if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      return { year: nextYear, month: nextMonth };
    });
  };

  const rows = useMemo(() => {
    let list = overview?.rows ?? [];
    if (filter !== 'all') list = list.filter((r) => r.planType === filter);
    if (onlyAlerts) list = list.filter((r) => r.hasAlert);
    return list;
  }, [overview, filter, onlyAlerts]);

  const columns: Column<SupportBillingRow>[] = [
    { key: 'client', header: 'Cliente', render: (r) => r.clientName },
    {
      key: 'plan',
      header: 'Contrato',
      render: (r) => (
        <Link to={`/soporte/${r.planId}`} className={styles.planCell}>
          {r.planName}
          {r.scope === 'consolidated' && <SupportPlanScopeBadge scope={r.scope} />}
        </Link>
      ),
    },
    { key: 'type', header: 'Tipo', render: (r) => <SupportPlanTypeBadge planType={r.planType} /> },
    { key: 'amount', header: 'Monto', align: 'right', render: (r) => (r.amountUf !== null ? formatMoney(r.amountUf, r.currency) : '—') },
    { key: 'billing', header: 'Estado facturación', render: (r) => <SupportInvoiceBillingStatusBadge status={r.billingStatus} /> },
    { key: 'payment', header: 'Estado de pago', render: (r) => <SupportInvoicePaymentStatusBadge status={r.paymentStatus} /> },
    {
      key: 'alert',
      header: '',
      width: '32px',
      render: (r) => (r.hasAlert || r.isOverdue ? <TriangleAlertIcon size={16} className={r.isOverdue ? styles.overdueIcon : styles.alertIcon} /> : null),
    },
  ];

  return (
    <DashboardLayout title="Facturación de Soporte">
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div>
            <h1 className={styles.title}>Facturación de Soporte</h1>
            <p className={styles.subtitle}>Qué corresponde cobrar este período, por cliente y tipo de contrato.</p>
          </div>
          <div className={styles.periodSelect}>
            <button type="button" className={styles.periodNav} onClick={() => changeMonth(-1)} aria-label="Mes anterior">
              ‹
            </button>
            <Select
              aria-label="Mes"
              options={MONTH_OPTIONS}
              value={String(month)}
              onChange={(e) => setPeriod((prev) => ({ ...prev, month: Number(e.target.value) }))}
            />
            <Select
              aria-label="Año"
              options={YEAR_OPTIONS}
              value={String(year)}
              onChange={(e) => setPeriod((prev) => ({ ...prev, year: Number(e.target.value) }))}
            />
            <button type="button" className={styles.periodNav} onClick={() => changeMonth(1)} aria-label="Mes siguiente">
              ›
            </button>
          </div>
        </div>

        {/* Sumar montos de monedas distintas inventaría un número sin sentido — un grupo de 4 tarjetas por cada moneda con contratos activos (en la práctica, casi siempre solo UF). Las "Alertas activas" son agnósticas a moneda, así que van una sola vez, junto al primer grupo. */}
        {(overview?.perCurrency && overview.perCurrency.length > 0 ? overview.perCurrency : [EMPTY_KPI_GROUP]).map((group, index) => {
          const showCurrencyTag = (overview?.perCurrency.length ?? 0) > 1;
          const tag = showCurrencyTag ? ` (${group.currency})` : '';
          return (
            <div className={styles.kpis} key={group.currency}>
              <KpiCard
                label={`Por facturar este período${tag}`}
                value={isLoading ? '…' : formatMoney(group.toInvoiceAmount, group.currency)}
                sub={`${group.toInvoiceCount} contratos`}
              />
              <KpiCard label={`Facturado este período${tag}`} value={isLoading ? '…' : formatMoney(group.invoicedAmount, group.currency)} />
              <KpiCard label={`Pagado este período${tag}`} value={isLoading ? '…' : formatMoney(group.paidAmount, group.currency)} />
              <KpiCard
                label={`Pagos atrasados${tag}`}
                tone="danger"
                value={isLoading ? '…' : formatMoney(group.overdueAmount, group.currency)}
                sub={`${group.overdueCount} facturas · en todos los períodos`}
              />
              {index === 0 && (
                <KpiCard
                  label="Alertas activas"
                  tone="warning"
                  value={isLoading ? '…' : (overview?.alertsCount ?? 0)}
                  sub="Requieren revisión antes de facturar"
                  onClick={() => setOnlyAlerts((prev) => !prev)}
                  active={onlyAlerts}
                />
              )}
            </div>
          );
        })}

        <div className={styles.filtersRow}>
          <Tabs tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))} activeId={filter} onSelect={(id) => setFilter(id as TypeFilter)} />
        </div>

        <Card>
          <DataTable
            caption="Contratos por facturar en el período"
            columns={columns}
            items={rows}
            getRowKey={(r) => r.planId}
            loading={isLoading}
            error={null}
            emptyMessage="No hay contratos en este filtro."
          />
        </Card>
      </div>
    </DashboardLayout>
  );
}
