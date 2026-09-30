import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  SUPPORT_PLAN_TYPE_LABELS,
  type SupportBillingKpiGroup,
  type SupportBillingRow,
  type SupportInvoiceBillingStatus,
  type SupportInvoicePaymentStatus,
} from '@kora/contracts';
import styles from './SupportBillingSection.module.css';
import { KpiCard } from '@/shared/components/ui/KpiCard';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { Tabs } from '@/shared/components/ui/Tabs';
import { PeriodSelector } from '@/shared/components/ui/PeriodSelector';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { TriangleAlertIcon } from '@/shared/components/icons/Icons';
import {
  SupportInvoiceBillingStatusBadge,
  SupportInvoicePaymentStatusBadge,
  SupportPlanScopeBadge,
  SupportPlanTypeBadge,
} from '@/modules/projects/components/SupportPlanBadges';
import { formatMoney } from '@/shared/lib/format-money';
import { useSupportBillingOverview } from '../api/billing.queries';
import { supportPlanPath } from '@/app/router/paths';
import { compareSortValues, nextSortState, type SortValue } from '@/shared/lib/sort';

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

/** `alerts` no es un tipo de contrato, pero va en la misma fila de tabs (Figma) — es el mismo filtro que activa la tarjeta "Alertas activas". */
type TypeFilter = 'all' | 'on_demand' | 'bundle' | 'monthly' | 'alerts';
const FILTERS: Readonly<{ id: TypeFilter; label: string }[]> = [
  { id: 'all', label: 'Todos' },
  { id: 'on_demand', label: 'A demanda' },
  { id: 'bundle', label: 'Bolsa' },
  { id: 'monthly', label: 'Mensual' },
  { id: 'alerts', label: 'Con alertas' },
];

/** Los estados se ordenan por su avance en el flujo de cobro, no alfabéticamente. "Sin movimiento" (`null`) queda al final. */
const BILLING_STATUS_ORDER: Readonly<Record<SupportInvoiceBillingStatus, number>> = { to_invoice: 0, invoiced: 1 };
const PAYMENT_STATUS_ORDER: Readonly<Record<SupportInvoicePaymentStatus, number>> = { pending: 0, overdue: 1, paid: 2 };

type SortField = 'client' | 'plan' | 'type' | 'amount' | 'billing' | 'payment';
const SORT_VALUE: Record<SortField, (row: SupportBillingRow) => SortValue> = {
  client: (r) => r.clientName,
  plan: (r) => r.planName,
  type: (r) => SUPPORT_PLAN_TYPE_LABELS[r.planType],
  amount: (r) => r.amountUf,
  billing: (r) => (r.billingStatus ? BILLING_STATUS_ORDER[r.billingStatus] : null),
  payment: (r) => (r.paymentStatus ? PAYMENT_STATUS_ORDER[r.paymentStatus] : null),
};

function currentPeriod(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Contenido de Facturación de Soporte — una fila por contrato activo en el
 * período seleccionado, más los KPIs agregados. Regla obligatoria del
 * backend (`GetSupportBillingOverviewUseCase`): solo el período en curso
 * calcula un monto en vivo; cualquier otro período muestra solo facturas que
 * existen de verdad, para no inventar deuda al mirar un mes viejo.
 *
 * Contenido de la pestaña "Soporte" de `/facturacion` (`BillingLedgerPage`).
 * `/facturacion-soporte` existió como página propia hasta que esta pestaña
 * pasó a cubrir exactamente lo mismo; ahora ese path solo redirige acá (ver
 * `app/router/routes.tsx`).
 *
 * Simplificación respecto al prototipo de referencia: cada fila navega a la
 * ficha del contrato (`SupportPlanDetailPage`) en vez de abrir un panel
 * lateral aparte — evita duplicar ahí las mismas acciones de facturar/pagar.
 */
export function SupportBillingSection() {
  const [{ year, month }, setPeriod] = useState(currentPeriod());
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  // `null` = el orden en que llegan de la API, hasta que se hace clic en un encabezado.
  const [sort, setSort] = useState<SortState<SortField> | null>(null);

  const period = `${year}-${String(month).padStart(2, '0')}`;
  const { data: overview, isLoading } = useSupportBillingOverview(period);

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of overview?.rows ?? []) seen.set(row.clientId, row.clientName);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [overview]);

  const rows = useMemo(() => {
    let list = overview?.rows ?? [];
    if (filter === 'alerts') list = list.filter((r) => r.hasAlert);
    else if (filter !== 'all') list = list.filter((r) => r.planType === filter);
    if (clientFilter.length > 0) list = list.filter((r) => clientFilter.includes(r.clientId));
    if (!sort) return list;
    const valueOf = SORT_VALUE[sort.field];
    return [...list].sort((a, b) => compareSortValues(valueOf(a), valueOf(b), sort.direction));
  }, [overview, filter, clientFilter, sort]);
  const { pageItems, pagination } = usePaginatedItems(rows);

  const columns: Column<SupportBillingRow>[] = [
    { key: 'client', header: 'Cliente', sortable: true, render: (r) => r.clientName },
    {
      key: 'plan',
      header: 'Contrato',
      sortable: true,
      render: (r) => (
        <Link to={supportPlanPath({ id: r.planId })} className={styles.planCell}>
          {r.planName}
          {r.scope === 'consolidated' && <SupportPlanScopeBadge scope={r.scope} />}
        </Link>
      ),
    },
    { key: 'type', header: 'Tipo', sortable: true, render: (r) => <SupportPlanTypeBadge planType={r.planType} /> },
    { key: 'amount', header: 'Monto', align: 'right', sortable: true, render: (r) => (r.amountUf !== null ? formatMoney(r.amountUf, r.currency) : '—') },
    { key: 'billing', header: 'Estado facturación', sortable: true, render: (r) => <SupportInvoiceBillingStatusBadge status={r.billingStatus} /> },
    { key: 'payment', header: 'Estado de pago', sortable: true, render: (r) => <SupportInvoicePaymentStatusBadge status={r.paymentStatus} /> },
    {
      key: 'alert',
      header: '',
      // 2 íconos de 16px + separación + 16px de padding por lado — con `box-sizing: border-box`, un ancho menor deja la celda sin espacio para el ícono.
      width: '72px',
      render: (r) =>
        r.hasAlert || r.isOverdue ? (
          <span className={styles.alertIcons}>
            {r.hasAlert && <TriangleAlertIcon size={16} className={styles.alertIcon} role="img" aria-hidden={false} aria-label="Alerta del contrato" />}
            {r.isOverdue && <TriangleAlertIcon size={16} className={styles.overdueIcon} role="img" aria-hidden={false} aria-label="Factura atrasada" />}
          </span>
        ) : null,
    },
  ];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.sectionTitle}>Soporte</p>
          <p className={styles.sectionSubtitle}>Qué corresponde cobrar este período, por cliente y tipo de contrato.</p>
        </div>
        <PeriodSelector year={year} month={month} onChange={setPeriod} />
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
                onClick={() => setFilter((prev) => (prev === 'alerts' ? 'all' : 'alerts'))}
                active={filter === 'alerts'}
              />
            )}
          </div>
        );
      })}

      <div className={styles.filtersRow}>
        <Tabs tabs={FILTERS.map((f) => ({ id: f.id, label: f.label }))} activeId={filter} onSelect={(id) => setFilter(id as TypeFilter)} />
        <MultiSelect
          label="Cliente"
          placeholder="Todos"
          searchPlaceholder="Buscar cliente"
          options={clientOptions}
          value={clientFilter}
          onChange={setClientFilter}
          className={styles.clientSelect}
        />
      </div>

      <DataTable
        caption="Contratos por facturar en el período"
        columns={columns}
        items={pageItems}
        getRowKey={(r) => r.planId}
        sort={sort ?? undefined}
        onSortChange={(field) => setSort((prev) => nextSortState(prev, field as SortField))}
        loading={isLoading}
        error={null}
        emptyMessage="No hay contratos en este filtro."
      />

      <Pagination {...pagination} />
    </div>
  );
}
