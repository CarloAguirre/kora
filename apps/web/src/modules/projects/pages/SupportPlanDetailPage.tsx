import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SUPPORT_PLAN_TYPE_LABELS, type SupportInvoice, type SupportInvoicePendingPeriod } from '@kora/contracts';
import styles from './SupportPlanDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { PageLoadError } from '@/shared/components/ui/PageLoadError';
import { Card } from '@/shared/components/ui/Card';
import { DEFAULT_PAGE_SIZE, Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { Tabs } from '@/shared/components/ui/Tabs';
import { PeriodSelector } from '@/shared/components/ui/PeriodSelector';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { ChevronLeftIcon, DownloadIcon, LinkIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useToast } from '@/shared/components/ui/Toast';
import { useTicketsList } from '@/modules/tickets/api/tickets.queries';
import { SupportTicketBrowser } from '../components/SupportTicketBrowser';
import { SupportPlanBillingAction } from '../components/SupportPlanBillingAction';
import {
  SupportInvoiceBillingStatusBadge,
  SupportInvoicePaymentStatusBadge,
  SupportPlanScopeBadge,
  SupportPlanStatusBadge,
  SupportPlanTypeBadge,
} from '../components/SupportPlanBadges';
import { MarkSupportInvoicePaidDialog } from '../components/MarkSupportInvoicePaidDialog';
import { IssueSupportInvoiceDialog } from '../components/IssueSupportInvoiceDialog';
import { SupportMonthlyBillingSchedule, formatPeriodMonth } from '../components/SupportMonthlyBillingSchedule';
import { SupportInvoiceDocumentButton } from '../components/SupportInvoiceDocumentButton';
import { SupportPendingPeriodsCard } from '../components/SupportPendingPeriodsCard';
import { CloseSupportPlanDialog } from '../components/CloseSupportPlanDialog';
import {
  useCloseSupportInvoicePeriod,
  useCloseSupportPlan,
  useIssueSupportInvoice,
  useMarkSupportInvoicePaid,
  useSupportPlanDetail,
  useVoidSupportInvoice,
} from '../api/support-plan.queries';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { formatMoney } from '@/shared/lib/format-money';
import { clientPath, clientPortalPreviewPath } from '@/app/router/paths';

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

type PayAction = { invoice: SupportInvoice } | null;

/**
 * Qué se va a registrar desde la ficha: un mes sin factura (por su período
 * mensual) o las facturas que le faltan a un mes "facturado parcial" (por su
 * `periodKey`, con el saldo como referencia).
 */
interface IssueTarget {
  readonly periodKey: string;
  readonly monthlyPeriodId: string | null;
  readonly amountUf: number;
  readonly append: boolean;
}

function currentMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * Ficha de contrato de soporte. Para `scope='consolidated'` muestra subtabs
 * por proyecto de desarrollo cubierto — igual mecanismo que la vista antigua
 * (`SupportProjectDetailView`) filtraba por `project.type`, aquí filtra
 * tickets por el proyecto activo entre los vinculados al contrato.
 *
 * Estructura calcada del mockup de referencia (`kora-facturacion-soporte.html`
 * → detalle de contrato): fila de identidad con tipo de contrato (cliente
 * enlaza a su ficha), fila de info condicional por tipo de plan, historial de
 * facturaciones arriba del todo, alerta+acción de facturar combinadas en una
 * tarjeta (`SupportPlanBillingAction`), y tickets en panel maestro-detalle en
 * línea (`SupportTicketBrowser`, con `TicketDetailModal` disponible desde ahí
 * para editar/cerrar/HH extra sin duplicar esa lógica acá). El chart/donut de
 * consumo y el card de SLA que tenía esta ficha antes no están en el mockup
 * — se sacaron a pedido explícito, no se movieron.
 */
export function SupportPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const { data: plan, isLoading, error } = useSupportPlanDetail(planId ?? null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [payAction, setPayAction] = useState<PayAction>(null);
  const [invoiceToVoid, setInvoiceToVoid] = useState<SupportInvoice | null>(null);
  const [issueTarget, setIssueTarget] = useState<IssueTarget | null>(null);
  const [periodToClose, setPeriodToClose] = useState<SupportInvoicePendingPeriod | null>(null);
  const [closing, setClosing] = useState(false);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPageSize, setTicketsPageSize] = useState(DEFAULT_PAGE_SIZE);
  /** `null` = todos los meses. Por defecto, el mes en curso. */
  const [ticketsMonth, setTicketsMonth] = useState<{ year: number; month: number } | null>(currentMonth);

  const issueInvoice = useIssueSupportInvoice(plan?.id ?? '', plan?.clientId);
  const markPaid = useMarkSupportInvoicePaid(plan?.id ?? '', plan?.clientId);
  const voidInvoice = useVoidSupportInvoice(plan?.clientId);
  const closeInvoicePeriod = useCloseSupportInvoicePeriod(plan?.id ?? '', plan?.clientId);
  const closePlan = useCloseSupportPlan(plan?.id ?? '', plan?.clientId);

  const currentProjectId = activeProjectId ?? plan?.linkedProjects[0]?.id ?? null;

  const { data: tickets, isLoading: loadingTickets } = useTicketsList({
    projectId: currentProjectId ?? undefined,
    page: ticketsPage,
    pageSize: ticketsPageSize,
    month: ticketsMonth ? `${ticketsMonth.year}-${String(ticketsMonth.month).padStart(2, '0')}` : undefined,
    sortField: 'createdAt',
    sortDirection: 'desc',
  });

  const sortedInvoices = useMemo(
    () => [...(plan?.invoices ?? [])].sort((a, b) => b.periodKey.localeCompare(a.periodKey) || a.position - b.position),
    [plan],
  );
  // Cada factura se anula por separado (ver `VoidSupportInvoiceUseCase`): si el mes conserva otras, el monto anulado vuelve a quedar por facturar.
  const voidKeepsOthers = useMemo(
    () => (invoiceToVoid ? sortedInvoices.some((i) => i.periodKey === invoiceToVoid.periodKey && i.id !== invoiceToVoid.id) : false),
    [invoiceToVoid, sortedInvoices],
  );
  const { pageItems: pagedInvoices, pagination: invoicesPagination } = usePaginatedItems(sortedInvoices);

  if (error) {
    return (
      <DashboardLayout title="Contrato de soporte">
        <PageLoadError error={error} subject="este contrato de soporte" backLabel="Volver a proyectos" onBack={() => void navigate('/proyectos')} />
      </DashboardLayout>
    );
  }

  if (isLoading || !plan || !planId) {
    return (
      <DashboardLayout title="Contrato de soporte">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  const canManageBilling = can('billing:manage');
  const canManagePlan = can('projects:manage');

  const scopeText =
    plan.scope === 'consolidated'
      ? `Consolidado: ${plan.linkedProjects.map((p) => p.name).join(', ')}`
      : `Proyecto único: ${plan.linkedProjects[0]?.name ?? plan.name}`;

  const shareLink = () => {
    void navigator.clipboard.writeText(window.location.href).then(
      () => toast.success('Enlace copiado al portapapeles.'),
      () => toast.error('No se pudo copiar el enlace.'),
    );
  };

  const invoiceColumns: Column<SupportInvoice>[] = [
    {
      key: 'folio',
      header: 'Folio',
      render: (i) => (
        <span className={styles.folioCell}>
          {i.folio}
          <span className={styles.folioSub}>
            emitida {formatDate(i.invoicedAt)}
            {i.dueAt ? ` · vence ${formatDate(i.dueAt)}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'period', header: 'Período', render: (i) => i.periodKey },
    { key: 'amount', header: 'Monto', align: 'right', render: (i) => formatMoney(i.amountUf, i.currency) },
    { key: 'status', header: 'Estado', render: (i) => <SupportInvoicePaymentStatusBadge status={i.paymentStatus} /> },
    {
      key: 'actions',
      header: '',
      render: (i) => (
        <span className={styles.invoiceActions}>
          <SupportInvoiceDocumentButton invoiceId={i.id} hasAttachment={i.hasAttachment} canManageBilling={canManageBilling} />
          {i.paymentStatus !== 'paid' && canManageBilling && (
            <>
              <Button variant="outline" size="sm" onClick={() => setPayAction({ invoice: i })}>
                Marcar como pagado
              </Button>
              <Button variant="dangerOutline" size="sm" onClick={() => setInvoiceToVoid(i)}>
                Anular factura
              </Button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout title="Contrato de soporte">
      <div className={styles.page}>
      <Link to="/facturacion" className={styles.backLink}>
        <ChevronLeftIcon size={14} />
        Volver a Facturación
      </Link>

      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{plan.name}</h1>
            <SupportPlanStatusBadge status={plan.status} />
            <SupportPlanScopeBadge scope={plan.scope} />
          </div>
          <p className={styles.subtitle}>
            Contrato de Soporte · {SUPPORT_PLAN_TYPE_LABELS[plan.planType]} · {scopeText}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" iconLeft={<LinkIcon size={15} />} onClick={shareLink}>
            Compartir PDF
          </Button>
          <Button variant="outline" iconLeft={<DownloadIcon size={15} />} onClick={() => window.print()}>
            Descargar PDF
          </Button>
          {plan.status === 'active' && canManagePlan && (
            <Button variant="outline" onClick={() => setClosing(true)}>
              Cerrar contrato
            </Button>
          )}
        </div>
      </div>

      {plan.status === 'ended' && plan.closedAt && (
        <div className={styles.closedBanner}>
          Contrato cerrado el {formatDate(plan.closedAt)} · {plan.closeReason}
        </div>
      )}

      <Card className={styles.identityCard}>
        <IdentityField
          label="Cliente"
          value={
            <Link to={clientPortalPreviewPath({ id: plan.clientId })} className={styles.clientLink}>
              {plan.clientName} ↗
            </Link>
          }
        />
        <IdentityField label="Responsable Kabeli" value={plan.leaderName ?? '—'} />
        <IdentityField label="Tipo de contrato" value={<SupportPlanTypeBadge planType={plan.planType} />} />
        <IdentityField label="Valor hora actual" value={formatMoney(plan.planValueUf, plan.currency)} />
        <IdentityField
          label="Valor hora extra"
          value={plan.planType === 'on_demand' ? 'No aplica' : formatMoney(plan.extraHourValueUf, plan.currency)}
        />
        <IdentityField
          label="Estado de facturación y pago"
          value={<SupportInvoiceBillingStatusBadge status={plan.currentBillingStatus} />}
          sub={
            plan.currentPendingAmountUf > 0
              ? `${formatMoney(plan.currentAmountUf, plan.currency)} · saldo ${formatMoney(plan.currentPendingAmountUf, plan.currency)}`
              : formatMoney(plan.currentAmountUf, plan.currency)
          }
        />
      </Card>

      <div className={styles.infoRow}>
        <Card className={styles.infoCard}>
          <span className={styles.infoLabel}>Fecha de inicio</span>
          <span className={styles.infoValue}>{formatDate(plan.startDate)}</span>
        </Card>
        <Card className={styles.infoCard}>
          <span className={styles.infoLabel}>Fecha de término</span>
          <span className={styles.infoValue}>{formatDate(plan.endDate)}</span>
        </Card>
        {plan.planType === 'on_demand' && (
          <Card className={styles.infoCard}>
            <span className={styles.infoLabel}>Responsable cliente</span>
            <span className={styles.infoValue}>{plan.contact?.name ?? '—'}</span>
          </Card>
        )}
        {plan.planType === 'bundle' && (
          <>
            <Card className={styles.infoCard}>
              <span className={styles.infoLabel}>HH contratadas</span>
              <span className={styles.infoValue}>{formatHours(plan.contractedHours)} h</span>
            </Card>
            <Card className={styles.infoCard}>
              <span className={styles.infoLabel}>HH consumidas</span>
              <span className={[styles.infoValue, plan.usedHours > plan.contractedHours ? styles.infoValueDanger : ''].join(' ')}>
                {formatHours(plan.usedHours)} h
              </span>
            </Card>
          </>
        )}
        {plan.planType === 'monthly' && (
          <>
            <Card className={styles.infoCard}>
              <span className={styles.infoLabel}>HH incluidas este período</span>
              <span className={styles.infoValue}>{formatHours(plan.summary.currentPeriod?.capacityHours ?? plan.contractedHours)} h</span>
            </Card>
            <Card className={styles.infoCard}>
              <span className={styles.infoLabel}>HH usadas este período</span>
              <span className={styles.infoValue}>{formatHours(plan.summary.currentPeriod?.usedHours ?? plan.usedHours)} h</span>
            </Card>
          </>
        )}
        {(plan.quotationLink || plan.contractLink || plan.additionalLinks) && (
          <Card className={styles.infoCard}>
            <span className={styles.infoLabel}>Documentación</span>
            <div className={styles.docLinks}>
              {plan.quotationLink && <a href={plan.quotationLink} target="_blank" rel="noreferrer">Cotización</a>}
              {plan.contractLink && <a href={plan.contractLink} target="_blank" rel="noreferrer">Contrato</a>}
              {plan.additionalLinks && <a href={plan.additionalLinks} target="_blank" rel="noreferrer">Adicionales</a>}
            </div>
          </Card>
        )}
      </div>

      <Card>
        <p className={styles.sectionTitle}>Historial de facturaciones del contrato</p>
        <DataTable
          caption="Historial de facturaciones del contrato"
          columns={invoiceColumns}
          items={pagedInvoices}
          getRowKey={(i) => i.id}
          loading={false}
          error={null}
          emptyMessage="Primer ciclo del contrato — todavía no hay historial."
        />

        <Pagination {...invoicesPagination} />
      </Card>

      <SupportPendingPeriodsCard
        periods={plan.pendingPeriods}
        currency={plan.currency}
        canManageBilling={canManageBilling}
        onIssue={(period) =>
          setIssueTarget({ periodKey: period.periodKey, monthlyPeriodId: period.monthlyPeriodId, amountUf: period.pendingAmountUf, append: true })
        }
        onClosePeriod={setPeriodToClose}
      />

      {plan.planType === 'monthly' && (
        <SupportMonthlyBillingSchedule
          periods={plan.billingPeriods}
          currency={plan.currency}
          canManageBilling={canManageBilling}
          onIssue={(period) =>
            setIssueTarget(
              period.status === 'partially_invoiced'
                ? { periodKey: period.periodKey, monthlyPeriodId: period.monthlyPeriodId, amountUf: period.pendingAmountUf, append: true }
                : { periodKey: period.periodKey, monthlyPeriodId: period.monthlyPeriodId, amountUf: period.amountUf, append: false },
            )
          }
        />
      )}

      <SupportPlanBillingAction
        plan={plan}
        canManageBilling={canManageBilling}
        onIssue={async (input) => {
          await issueInvoice.mutateAsync(input);
          toast.success('Se registró la factura.');
        }}
      />

      {plan.linkedProjects.length > 1 && (
        <Tabs
          tabs={plan.linkedProjects.map((p) => ({ id: p.id, label: p.name }))}
          activeId={currentProjectId ?? ''}
          onSelect={(id) => {
            setActiveProjectId(id);
            setTicketsPage(1);
          }}
        />
      )}

      <Card>
        <div className={styles.ticketsHead}>
          <p className={styles.sectionTitle}>Tickets del proyecto</p>
          <div className={styles.ticketsMonth}>
            {ticketsMonth ? (
              <>
                <PeriodSelector
                  year={ticketsMonth.year}
                  month={ticketsMonth.month}
                  onChange={(next) => {
                    setTicketsMonth(next);
                    setTicketsPage(1);
                  }}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setTicketsMonth(null);
                    setTicketsPage(1);
                  }}
                >
                  Ver todos los meses
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTicketsMonth(currentMonth());
                  setTicketsPage(1);
                }}
              >
                Filtrar por mes
              </Button>
            )}
          </div>
        </div>
        <p className={styles.ticketSummaryLine}>
          {ticketsMonth ? 'Tickets con actividad en el mes' : 'Tickets'}: <strong>{tickets?.total ?? 0}</strong> ·{' '}
          {ticketsMonth ? 'HH aprobadas en el mes' : 'HH utilizadas'} en tickets de este proyecto: <strong>{formatHours(tickets?.totalHours ?? 0)}h</strong>
        </p>

        <SupportTicketBrowser
          tickets={tickets}
          loading={loadingTickets}
          page={ticketsPage}
          onPageChange={setTicketsPage}
          onPageSizeChange={(size) => {
            setTicketsPageSize(size);
            setTicketsPage(1);
          }}
        />
      </Card>
      </div>

      <MarkSupportInvoicePaidDialog
        open={payAction !== null}
        invoices={payAction ? [{ id: payAction.invoice.id, folio: payAction.invoice.folio }] : []}
        onClose={() => setPayAction(null)}
        onConfirm={async (invoiceId, input) => {
          await markPaid.mutateAsync({ invoiceId, input });
          toast.success('Se registró el pago.');
        }}
      />
      <ConfirmActionDialog
        open={invoiceToVoid !== null}
        title="Anular factura"
        description={
          invoiceToVoid
            ? `Se anulará el folio ${invoiceToVoid.folio} (${invoiceToVoid.periodKey} · ${formatMoney(invoiceToVoid.amountUf, invoiceToVoid.currency)}). ${
                voidKeepsOthers
                  ? 'Las demás facturas del mes se mantienen y este monto vuelve a quedar por facturar ("Facturado parcial"), para registrar la factura correcta.'
                  : 'El mes vuelve a quedar "Por facturar" para registrarlo de nuevo con el monto correcto.'
              }`
            : ''
        }
        warning="Kora no emite la factura: anula también el documento en el sistema de facturación."
        confirmLabel="Anular factura"
        destructive
        onConfirm={async () => {
          if (!invoiceToVoid) return;
          await voidInvoice.mutateAsync(invoiceToVoid.id);
          toast.success(`Se anuló el folio ${invoiceToVoid.folio}.`);
        }}
        onClose={() => setInvoiceToVoid(null)}
      />
      <IssueSupportInvoiceDialog
        open={issueTarget !== null}
        description={
          issueTarget
            ? `${formatPeriodMonth(issueTarget.periodKey)} · ${issueTarget.append ? 'saldo por facturar ' : ''}${formatMoney(issueTarget.amountUf, plan.currency)}`
            : ''
        }
        totalAmount={issueTarget?.amountUf ?? 0}
        reference={issueTarget?.append ? 'pending' : 'calculated'}
        currency={plan.currency}
        onClose={() => setIssueTarget(null)}
        onConfirm={async (input) => {
          if (!issueTarget) return;
          if (issueTarget.append) await issueInvoice.mutateAsync({ ...input, periodKey: issueTarget.periodKey });
          else if (issueTarget.monthlyPeriodId) await issueInvoice.mutateAsync({ ...input, monthlyPeriodId: issueTarget.monthlyPeriodId });
          else return;
          toast.success('Se registró la factura.');
        }}
      />
      <ConfirmActionDialog
        open={periodToClose !== null}
        title="Cerrar mes por lo facturado"
        description={
          periodToClose
            ? `${formatPeriodMonth(periodToClose.periodKey)} quedará facturado por ${formatMoney(periodToClose.invoicedAmountUf, plan.currency)} (folios ${periodToClose.invoices.map((i) => i.folio).join(', ')}). El saldo de ${formatMoney(periodToClose.pendingAmountUf, plan.currency)} no se cobra después.`
            : ''
        }
        confirmLabel="Cerrar mes"
        onConfirm={async () => {
          if (!periodToClose) return;
          await closeInvoicePeriod.mutateAsync(periodToClose.periodKey);
          toast.success(`Se cerró ${formatPeriodMonth(periodToClose.periodKey)} por lo facturado.`);
        }}
        onClose={() => setPeriodToClose(null)}
      />
      <CloseSupportPlanDialog
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={async (input) => {
          await closePlan.mutateAsync(input);
          toast.success('Se cerró el contrato.');
          navigate(clientPath({ id: plan.clientId }));
        }}
      />
    </DashboardLayout>
  );
}

function IdentityField({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={styles.identityField}>
      <span className={styles.identityLabel}>{label}</span>
      <span className={styles.identityValue}>{value}</span>
      {sub && <span className={styles.identitySub}>{sub}</span>}
    </div>
  );
}
