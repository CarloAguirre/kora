import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SUPPORT_PLAN_TYPE_LABELS, type SupportInvoice, type SupportMonthlyBillingPeriod } from '@kora/contracts';
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
import { CloseSupportPlanDialog } from '../components/CloseSupportPlanDialog';
import {
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
  const [issuePeriod, setIssuePeriod] = useState<SupportMonthlyBillingPeriod | null>(null);
  const [closing, setClosing] = useState(false);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPageSize, setTicketsPageSize] = useState(DEFAULT_PAGE_SIZE);
  /** `null` = todos los meses. Por defecto, el mes en curso. */
  const [ticketsMonth, setTicketsMonth] = useState<{ year: number; month: number } | null>(currentMonth);

  const issueInvoice = useIssueSupportInvoice(plan?.id ?? '', plan?.clientId);
  const markPaid = useMarkSupportInvoicePaid(plan?.id ?? '', plan?.clientId);
  const voidInvoice = useVoidSupportInvoice(plan?.clientId);
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
  // Las facturas de un período se anulan juntas (ver `VoidSupportInvoiceUseCase`) — el diálogo tiene que nombrarlas todas.
  const invoicesToVoid = useMemo(
    () => (invoiceToVoid ? sortedInvoices.filter((i) => i.periodKey === invoiceToVoid.periodKey) : []),
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
          sub={formatMoney(plan.currentAmountUf, plan.currency)}
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

      {plan.planType === 'monthly' && (
        <SupportMonthlyBillingSchedule
          periods={plan.billingPeriods}
          currency={plan.currency}
          canManageBilling={canManageBilling}
          onIssue={setIssuePeriod}
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
        title={invoicesToVoid.length > 1 ? 'Anular facturas del período' : 'Anular factura'}
        description={
          invoiceToVoid
            ? invoicesToVoid.length > 1
              ? `El total de ${invoiceToVoid.periodKey} se dividió en ${invoicesToVoid.length} facturas y se anulan todas juntas: folios ${invoicesToVoid.map((i) => i.folio).join(', ')} (${formatMoney(invoicesToVoid.reduce((total, i) => total + i.amountUf, 0), invoiceToVoid.currency)}). El mes vuelve a quedar "Por facturar" para registrarlo de nuevo con el monto correcto.`
              : `Se anulará el folio ${invoiceToVoid.folio} (${invoiceToVoid.periodKey} · ${formatMoney(invoiceToVoid.amountUf, invoiceToVoid.currency)}). El mes vuelve a quedar "Por facturar" para registrarlo de nuevo con el monto correcto.`
            : ''
        }
        warning={
          invoicesToVoid.length > 1
            ? 'Kora no emite las facturas: anula también cada documento en el sistema de facturación.'
            : 'Kora no emite la factura: anula también el documento en el sistema de facturación.'
        }
        confirmLabel={invoicesToVoid.length > 1 ? 'Anular facturas' : 'Anular factura'}
        destructive
        onConfirm={async () => {
          if (!invoiceToVoid) return;
          const folios = invoicesToVoid.map((i) => i.folio);
          await voidInvoice.mutateAsync(invoiceToVoid.id);
          toast.success(folios.length > 1 ? `Se anularon los folios ${folios.join(', ')}.` : `Se anuló el folio ${invoiceToVoid.folio}.`);
        }}
        onClose={() => setInvoiceToVoid(null)}
      />
      <IssueSupportInvoiceDialog
        open={issuePeriod !== null}
        description={issuePeriod ? `${formatPeriodMonth(issuePeriod.periodKey)} · ${formatMoney(issuePeriod.amountUf, plan.currency)}` : ''}
        totalAmount={issuePeriod?.amountUf ?? 0}
        currency={plan.currency}
        onClose={() => setIssuePeriod(null)}
        onConfirm={async (input) => {
          if (!issuePeriod?.monthlyPeriodId) return;
          await issueInvoice.mutateAsync({ ...input, monthlyPeriodId: issuePeriod.monthlyPeriodId });
          toast.success('Se registró la factura.');
        }}
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
