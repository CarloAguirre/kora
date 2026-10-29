import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  SUPPORT_PLAN_ALERT_LABELS,
  type ListSupportBillingRowsQuery,
  type SupportBillingKpiGroup,
  type SupportBillingRow,
  type SupportBillingRowSortField,
} from '@kora/contracts';
import styles from './SupportBillingSection.module.css';
import { KpiCard } from '@/shared/components/ui/KpiCard';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
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
import {
  useIssueSupportInvoiceFromBilling,
  useMarkSupportInvoicePaidFromBilling,
  useSupportBillingOverview,
  useSupportBillingRows,
} from '../api/billing.queries';
import { Button } from '@/shared/components/ui/Button';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { IssueSupportInvoiceDialog } from '@/modules/projects/components/IssueSupportInvoiceDialog';
import { MarkSupportInvoicePaidDialog } from '@/modules/projects/components/MarkSupportInvoicePaidDialog';
import { supportPlanPath } from '@/app/router/paths';
import { nextSortState } from '@/shared/lib/sort';

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

/** Mismo default que el servidor (`listSupportBillingRowsQuerySchema`) — es también el orden más barato de calcular allá. */
const DEFAULT_SORT: SortState<SupportBillingRowSortField> = { field: 'client', direction: 'asc' };

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
 * Cada fila navega a la ficha del contrato (`SupportPlanDetailPage`) y, con
 * `billing:manage`, permite registrar la factura del período en curso o
 * marcar como pagada la del período consultado sin salir del panel — con los
 * mismos diálogos que la ficha.
 */
export function SupportBillingSection() {
  const [{ year, month }, setPeriod] = useState(currentPeriod());
  const [filter, setFilterState] = useState<TypeFilter>('all');
  const [clientFilter, setClientFilterState] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState<SupportBillingRowSortField>>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [issueRow, setIssueRow] = useState<SupportBillingRow | null>(null);
  const [payRow, setPayRow] = useState<SupportBillingRow | null>(null);
  const toast = useToast();
  const { can } = usePermissions();
  const canManageBilling = can('billing:manage');
  const issueInvoice = useIssueSupportInvoiceFromBilling();
  const markPaid = useMarkSupportInvoicePaidFromBilling();

  // Todo cambio de filtro, orden, período o tamaño vuelve a la página 1 — si no, se puede quedar parado en una página que ya no existe.
  const setFilter = (next: TypeFilter | ((prev: TypeFilter) => TypeFilter)) => {
    setFilterState(next);
    setPage(1);
  };
  const setClientFilter = (next: string[]) => {
    setClientFilterState(next);
    setPage(1);
  };

  const period = `${year}-${String(month).padStart(2, '0')}`;
  const { data: overview, isLoading } = useSupportBillingOverview(period);

  const rowsQuery = useMemo<ListSupportBillingRowsQuery>(
    () => ({
      period,
      page,
      pageSize,
      planType: filter === 'all' || filter === 'alerts' ? undefined : filter,
      onlyAlerts: filter === 'alerts' ? true : undefined,
      clientId: clientFilter.length > 0 ? clientFilter : undefined,
      sortField: sort.field,
      sortDirection: sort.direction,
    }),
    [period, page, pageSize, filter, clientFilter, sort],
  );
  const { data: rowsPage, isLoading: rowsLoading, error: rowsError } = useSupportBillingRows(rowsQuery);

  const clientOptions = useMemo(
    () => (overview?.clients ?? []).map((client) => ({ value: client.id, label: client.name })),
    [overview],
  );

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
    { key: 'amount', header: 'Monto', align: 'right', sortable: true, render: (r) => formatMoney(r.amountUf ?? 0, r.currency) },
    { key: 'billing', header: 'Estado facturación', sortable: true, render: (r) => <SupportInvoiceBillingStatusBadge status={r.billingStatus} /> },
    { key: 'payment', header: 'Estado de pago', sortable: true, render: (r) => <SupportInvoicePaymentStatusBadge status={r.paymentStatus} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => {
        if (!canManageBilling) return null;
        if (r.canInvoice) {
          return (
            <Button variant="outline" size="sm" onClick={() => setIssueRow(r)}>
              Registrar factura
            </Button>
          );
        }
        if (r.invoiceId && r.paymentStatus !== 'paid') {
          return (
            <Button variant="outline" size="sm" onClick={() => setPayRow(r)}>
              Marcar como pagado
            </Button>
          );
        }
        return null;
      },
    },
    {
      key: 'alert',
      header: '',
      // 2 íconos de 16px + separación + 16px de padding por lado — con `box-sizing: border-box`, un ancho menor deja la celda sin espacio para el ícono.
      width: '72px',
      render: (r) =>
        r.hasAlert || r.isOverdue ? (
          <span className={styles.alertIcons}>
            {r.hasAlert && (
              <AlertTooltip lines={r.alerts.map((type) => SUPPORT_PLAN_ALERT_LABELS[type])} label="Alerta del contrato">
                <TriangleAlertIcon size={16} className={styles.alertIcon} />
              </AlertTooltip>
            )}
            {r.isOverdue && (
              <AlertTooltip lines={['Hay una factura con el pago atrasado']} label="Factura atrasada">
                <TriangleAlertIcon size={16} className={styles.overdueIcon} />
              </AlertTooltip>
            )}
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
        <PeriodSelector
          year={year}
          month={month}
          onChange={(next) => {
            setPeriod(next);
            setPage(1);
          }}
        />
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
        items={rowsPage?.items ?? []}
        getRowKey={(r) => r.planId}
        sort={sort}
        onSortChange={(field) => {
          setSort((prev) => nextSortState(prev, field as SupportBillingRowSortField));
          setPage(1);
        }}
        loading={rowsLoading}
        error={rowsError ? 'No se pudieron cargar los contratos del período.' : null}
        emptyMessage="No hay contratos en este filtro."
      />

      <IssueSupportInvoiceDialog
        open={issueRow !== null}
        description={issueRow ? `${issueRow.planName} · ${formatMoney(issueRow.amountUf ?? 0, issueRow.currency)}` : ''}
        onClose={() => setIssueRow(null)}
        onConfirm={async (input) => {
          if (!issueRow) return;
          await issueInvoice.mutateAsync({ planId: issueRow.planId, input });
          toast.success('Se registró la factura.');
        }}
      />
      <MarkSupportInvoicePaidDialog
        open={payRow !== null}
        folio={payRow?.folio ?? ''}
        onClose={() => setPayRow(null)}
        onConfirm={async (input) => {
          if (!payRow?.invoiceId) return;
          await markPaid.mutateAsync({ invoiceId: payRow.invoiceId, input });
          toast.success('Se registró el pago.');
        }}
      />

      {rowsPage && (
        <Pagination
          page={page}
          pageCount={rowsPage.pageCount}
          total={rowsPage.total}
          pageSize={rowsPage.pageSize}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      )}
    </div>
  );
}

/** Qué significa el ícono al pasar el mouse (o al enfocarlo con teclado) — mismo patrón CSS que `HhBreakdownTooltip`. */
function AlertTooltip({ lines, label, children }: { lines: readonly string[]; label: string; children: ReactNode }) {
  return (
    <span className={styles.alertTooltipWrapper} tabIndex={0} role="img" aria-label={`${label}: ${lines.join(', ')}`}>
      {children}
      <span className={styles.alertTooltip} role="tooltip">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
    </span>
  );
}
