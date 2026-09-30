import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { SUPPORT_PLAN_TYPE_LABELS, type SupportInvoice } from '@kora/contracts';
import styles from './SupportPlanDetailPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';
import { Tabs } from '@/shared/components/ui/Tabs';
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
import { CloseSupportPlanDialog } from '../components/CloseSupportPlanDialog';
import {
  useCloseSupportPlan,
  useIssueSupportInvoice,
  useMarkSupportInvoicePaid,
  useSupportPlanDetail,
} from '../api/support-plan.queries';
import { formatMoney } from '@/shared/lib/format-money';
import { clientPath, clientPortalPreviewPath } from '@/app/router/paths';

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');
const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

type PayAction = { invoice: SupportInvoice } | null;

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

  const { data: plan, isLoading } = useSupportPlanDetail(planId ?? null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [payAction, setPayAction] = useState<PayAction>(null);
  const [closing, setClosing] = useState(false);
  const [ticketsPage, setTicketsPage] = useState(1);
  const [ticketsPageSize, setTicketsPageSize] = useState(DEFAULT_PAGE_SIZE);

  const issueInvoice = useIssueSupportInvoice(planId ?? '', plan?.clientId);
  const markPaid = useMarkSupportInvoicePaid(planId ?? '', plan?.clientId);
  const closePlan = useCloseSupportPlan(planId ?? '', plan?.clientId);

  const currentProjectId = activeProjectId ?? plan?.linkedProjects[0]?.id ?? null;

  const { data: tickets, isLoading: loadingTickets } = useTicketsList({
    projectId: currentProjectId ?? undefined,
    page: ticketsPage,
    pageSize: ticketsPageSize,
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
      render: (i) =>
        i.paymentStatus !== 'paid' && canManageBilling ? (
          <Button variant="outline" size="sm" onClick={() => setPayAction({ invoice: i })}>
            Marcar como pagado
          </Button>
        ) : null,
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
          items={[...plan.invoices].sort((a, b) => b.periodKey.localeCompare(a.periodKey))}
          getRowKey={(i) => i.id}
          loading={false}
          error={null}
          emptyMessage="Primer ciclo del contrato — todavía no hay historial."
        />
      </Card>

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
        <p className={styles.sectionTitle}>Tickets del proyecto</p>
        <p className={styles.ticketSummaryLine}>
          Tickets: <strong>{tickets?.total ?? 0}</strong> · HH utilizadas: <strong>{formatHours(plan.usedHours)}h</strong>
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
        folio={payAction?.invoice.folio ?? ''}
        onClose={() => setPayAction(null)}
        onConfirm={async (input) => {
          if (!payAction) return;
          await markPaid.mutateAsync({ invoiceId: payAction.invoice.id, input });
          toast.success('Se registró el pago.');
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
