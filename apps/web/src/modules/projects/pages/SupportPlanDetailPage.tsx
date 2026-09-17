import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { SupportInvoice, TicketSummary } from '@kora/contracts';
import styles from './SupportPlanDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { Tabs } from '@/shared/components/ui/Tabs';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { ChevronLeftIcon } from '@/shared/components/icons/Icons';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { useToast } from '@/shared/components/ui/Toast';
import { useTicketsList } from '@/modules/tickets/api/tickets.queries';
import { TicketPriorityBadge } from '@/modules/tickets/components/TicketPriorityBadge';
import {
  SupportInvoiceBillingStatusBadge,
  SupportInvoicePaymentStatusBadge,
  SupportPlanScopeBadge,
  SupportPlanStatusBadge,
  SupportPlanTypeBadge,
} from '../components/SupportPlanBadges';
import { IssueSupportInvoiceDialog } from '../components/IssueSupportInvoiceDialog';
import { MarkSupportInvoicePaidDialog } from '../components/MarkSupportInvoicePaidDialog';
import { CloseSupportPlanDialog } from '../components/CloseSupportPlanDialog';
import { SupportHoursDonut } from '../components/SupportHoursDonut';
import { SupportProgressChart } from '../components/SupportProgressChart';
import {
  useCloseSupportPlan,
  useIssueSupportInvoice,
  useMarkSupportInvoicePaid,
  useSupportPlanDetail,
} from '../api/support-plan.queries';
import { formatMoney } from '@/shared/lib/format-money';

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const TICKETS_PAGE_SIZE = 25;

type InvoiceAction = { type: 'issue' } | { type: 'pay'; invoice: SupportInvoice } | null;

/**
 * Ficha de contrato de soporte. Para `scope='consolidated'` muestra subtabs
 * por proyecto de desarrollo cubierto — igual mecanismo que la vista antigua
 * (`SupportProjectDetailView`) filtraba por `project.type`, aquí filtra
 * tickets por el proyecto activo entre los vinculados al contrato.
 */
export function SupportPlanDetailPage() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const { data: plan, isLoading } = useSupportPlanDetail(planId ?? null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [invoiceAction, setInvoiceAction] = useState<InvoiceAction>(null);
  const [closing, setClosing] = useState(false);
  const [ticketsPage, setTicketsPage] = useState(1);

  const issueInvoice = useIssueSupportInvoice(planId ?? '', plan?.clientId);
  const markPaid = useMarkSupportInvoicePaid(planId ?? '', plan?.clientId);
  const closePlan = useCloseSupportPlan(planId ?? '', plan?.clientId);

  const currentProjectId = activeProjectId ?? plan?.linkedProjects[0]?.id ?? null;

  const { data: tickets, isLoading: loadingTickets } = useTicketsList({
    projectId: currentProjectId ?? undefined,
    page: ticketsPage,
    pageSize: TICKETS_PAGE_SIZE,
    sortField: 'createdAt',
    sortDirection: 'desc',
  });

  if (isLoading || !plan || !planId) {
    return (
      <DashboardLayout title="Contrato de soporte">
        <p>Cargando…</p>
      </DashboardLayout>
    );
  }

  const canManageBilling = can('billing:manage');
  const canManagePlan = can('projects:manage');

  const ticketColumns: Column<TicketSummary>[] = [
    {
      key: 'code',
      header: 'ID ticket',
      width: '110px',
      render: (t) => (
        <Link to={`/tickets/${t.id}`} className={styles.ticketLink}>
          {t.code ?? '—'}
        </Link>
      ),
    },
    { key: 'title', header: 'Título', render: (t) => t.title },
    { key: 'assignee', header: 'Responsable', render: (t) => t.assignee?.fullName ?? 'Sin asignar' },
    { key: 'estimatedHours', header: 'HH Est.', align: 'right', render: (t) => t.estimatedHours ?? 0 },
    { key: 'usedHours', header: 'HH Util.', align: 'right', render: (t) => formatHours(t.usedHours) },
    { key: 'priority', header: 'Criticidad', render: (t) => <TicketPriorityBadge priority={t.priority} /> },
  ];

  const invoiceColumns: Column<SupportInvoice>[] = [
    { key: 'folio', header: 'Folio', render: (i) => i.folio },
    { key: 'period', header: 'Período', render: (i) => i.periodKey },
    { key: 'amount', header: 'Monto', align: 'right', render: (i) => formatMoney(i.amountUf, i.currency) },
    { key: 'invoicedAt', header: 'Emitida', render: (i) => formatDate(i.invoicedAt) },
    { key: 'dueAt', header: 'Vence', render: (i) => formatDate(i.dueAt) },
    { key: 'status', header: 'Pago', render: (i) => <SupportInvoicePaymentStatusBadge status={i.paymentStatus} /> },
    {
      key: 'actions',
      header: '',
      render: (i) =>
        i.paymentStatus !== 'paid' && canManageBilling ? (
          <Button variant="outline" size="sm" onClick={() => setInvoiceAction({ type: 'pay', invoice: i })}>
            Marcar como pagado
          </Button>
        ) : null,
    },
  ];

  return (
    <DashboardLayout title="Contrato de soporte">
      <div className={styles.page}>
      <Link to={`/clientes/${plan.clientId}`} className={styles.backLink}>
        <ChevronLeftIcon size={14} />
        Volver a {plan.clientName}
      </Link>

      <div className={styles.header}>
        <div>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{plan.name}</h1>
            <SupportPlanStatusBadge status={plan.status} />
          </div>
          <div className={styles.badgeRow}>
            <SupportPlanTypeBadge planType={plan.planType} />
            <SupportPlanScopeBadge scope={plan.scope} />
          </div>
        </div>
        {plan.status === 'active' && canManagePlan && (
          <Button variant="outline" onClick={() => setClosing(true)}>
            Cerrar contrato
          </Button>
        )}
      </div>

      {plan.status === 'ended' && plan.closedAt && (
        <div className={styles.closedBanner}>
          Contrato cerrado el {formatDate(plan.closedAt)} · {plan.closeReason}
        </div>
      )}

      <Card className={styles.identityCard}>
        <IdentityField label="Cliente" value={plan.clientName} />
        <IdentityField label="Responsable Kabeli" value={plan.leaderName ?? '—'} />
        <IdentityField label="Contacto" value={plan.contact?.name ?? '—'} sub={plan.contact?.position ?? undefined} />
        <IdentityField label="Valor hora" value={formatMoney(plan.planValueUf, plan.currency)} />
        <IdentityField
          label="Valor hora extra"
          value={plan.planType === 'on_demand' ? 'No aplica' : formatMoney(plan.extraHourValueUf, plan.currency)}
        />
        <IdentityField
          label="Facturación de este período"
          value={<SupportInvoiceBillingStatusBadge status={plan.currentBillingStatus} />}
          sub={plan.currentBillingStatus ? formatMoney(plan.currentAmountUf, plan.currency) : undefined}
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
        <Card className={styles.infoCard}>
          <span className={styles.infoLabel}>Documentación</span>
          <div className={styles.docLinks}>
            {plan.quotationLink && <a href={plan.quotationLink} target="_blank" rel="noreferrer">Cotización</a>}
            {plan.contractLink && <a href={plan.contractLink} target="_blank" rel="noreferrer">Contrato</a>}
            {plan.additionalLinks && <a href={plan.additionalLinks} target="_blank" rel="noreferrer">Adicionales</a>}
            {!plan.quotationLink && !plan.contractLink && !plan.additionalLinks && '—'}
          </div>
        </Card>
      </div>

      <Card>
        <p className={styles.sectionTitle}>Tiempos de resolución (SLA)</p>
        <div className={styles.slaRow}>
          <SlaItem label="Crítica" hours={plan.targetHours.critical} />
          <SlaItem label="Alta" hours={plan.targetHours.high} />
          <SlaItem label="Media" hours={plan.targetHours.medium} />
          <SlaItem label="Baja" hours={plan.targetHours.low} />
        </div>
      </Card>

      <div className={styles.summaryRow}>
        <Card>
          <p className={styles.sectionTitle}>Estado del contrato</p>
          <SupportHoursDonut summary={plan.summary} />
        </Card>
        {plan.summary.history.length > 0 && (
          <Card>
            <SupportProgressChart summary={plan.summary} />
          </Card>
        )}
      </div>

      <Card>
        <p className={styles.sectionTitle}>Facturación</p>
        {plan.currentBillingStatus === 'to_invoice' && (
          <div className={styles.billingAction}>
            <span>Monto a facturar este período: <strong>{formatMoney(plan.currentAmountUf, plan.currency)}</strong></span>
            {canManageBilling && <Button onClick={() => setInvoiceAction({ type: 'issue' })}>Marcar como facturado</Button>}
          </div>
        )}
        {plan.currentBillingStatus === 'invoiced' && (
          <p className={styles.hint}>Ya se registró la factura de este período — para marcarla como pagada, usa el historial.</p>
        )}
        {plan.currentBillingStatus === null && <p className={styles.hint}>No hay nada por facturar en el período en curso.</p>}

        <p className={styles.sectionTitle} style={{ marginTop: 'var(--kora-space-5)' }}>Historial de facturaciones</p>
        <DataTable
          caption="Historial de facturaciones del contrato"
          columns={invoiceColumns}
          items={[...plan.invoices].sort((a, b) => b.periodKey.localeCompare(a.periodKey))}
          getRowKey={(i) => i.id}
          loading={false}
          error={null}
          emptyMessage="Primer ciclo del contrato — todavía no hay historial."
        />
      </Card>

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
        <p className={styles.sectionTitle}>Tickets del proyecto</p>
        <DataTable
          caption="Tickets del contrato"
          columns={ticketColumns}
          items={tickets?.items ?? []}
          getRowKey={(t) => t.id}
          loading={loadingTickets}
          error={null}
          emptyMessage="Sin tickets registrados."
        />
      </Card>
      </div>

      <IssueSupportInvoiceDialog
        open={invoiceAction?.type === 'issue'}
        amountUf={plan.currentAmountUf}
        currency={plan.currency}
        onClose={() => setInvoiceAction(null)}
        onConfirm={async (input) => {
          await issueInvoice.mutateAsync(input);
          toast.success('Se registró la factura.');
        }}
      />
      <MarkSupportInvoicePaidDialog
        open={invoiceAction?.type === 'pay'}
        folio={invoiceAction?.type === 'pay' ? invoiceAction.invoice.folio : ''}
        onClose={() => setInvoiceAction(null)}
        onConfirm={async (input) => {
          if (invoiceAction?.type !== 'pay') return;
          await markPaid.mutateAsync({ invoiceId: invoiceAction.invoice.id, input });
          toast.success('Se registró el pago.');
        }}
      />
      <CloseSupportPlanDialog
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={async (input) => {
          await closePlan.mutateAsync(input);
          toast.success('Se cerró el contrato.');
          navigate(`/clientes/${plan.clientId}`);
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

function SlaItem({ label, hours }: { label: string; hours: number | null }) {
  return (
    <div className={styles.slaItem}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={styles.infoValue}>{hours !== null ? `${hours}h` : '—'}</span>
    </div>
  );
}
