import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  BILLING_LEDGER_LINE_LABELS,
  BILLING_LEDGER_STATUS_LABELS,
  type BillingLedgerEntry,
  type BillingLedgerLine,
  type BillingLedgerStatus,
  type IssueProjectPaymentMilestoneInvoiceInput,
  type MarkProjectPaymentMilestonePaidInput,
  type MarkSupportInvoicePaidInput,
} from '@kora/contracts';
import styles from './BillingLedgerPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { KpiCard } from '@/shared/components/ui/KpiCard';
import { Select } from '@/shared/components/ui/Select';
import { Tabs } from '@/shared/components/ui/Tabs';
import { Switch } from '@/shared/components/ui/Switch';
import { Button } from '@/shared/components/ui/Button';
import { Badge, type BadgeTone } from '@/shared/components/ui/Badge';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { useToast } from '@/shared/components/ui/Toast';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { ApiRequestError } from '@/shared/lib/api-client';
import { formatMoney } from '@/shared/lib/format-money';
import { billingKeys } from '../api/billing.api';
import { useBillingLedger } from '../api/billing.queries';
import { IssueProjectMilestoneInvoiceDialog } from '@/modules/projects/components/IssueProjectMilestoneInvoiceDialog';
import { MarkProjectMilestonePaidDialog } from '@/modules/projects/components/MarkProjectMilestonePaidDialog';
import { MarkSupportInvoicePaidDialog } from '@/modules/projects/components/MarkSupportInvoicePaidDialog';
import {
  useIssueProjectPaymentMilestoneInvoice,
  useMarkProjectPaymentMilestonePaid,
  useProjectBillingSettings,
  useProjectDetail,
  useUpdateProjectBillingSettings,
} from '@/modules/projects/api/projects.queries';
import { useMarkSupportInvoicePaid } from '@/modules/projects/api/support-plan.queries';

type SegmentFilter = 'todas' | BillingLedgerLine;
type StatusFilter = 'todos' | BillingLedgerStatus;

const SEGMENT_TABS: ReadonlyArray<{ id: SegmentFilter; label: string }> = [
  { id: 'todas', label: 'Todas las líneas' },
  { id: 'soporte', label: 'Soporte' },
  { id: 'proyecto', label: 'Proyectos' },
];

const STATUS_TABS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendiente', label: 'Pendiente' },
  { id: 'facturado', label: 'Facturado' },
  { id: 'atrasado', label: 'Atrasado' },
  { id: 'pagado', label: 'Pagado' },
];

const STATUS_TONE: Readonly<Record<BillingLedgerStatus, BadgeTone>> = {
  pendiente: 'neutral',
  facturado: 'info',
  atrasado: 'danger',
  pagado: 'success',
};

const LINE_TONE: Readonly<Record<BillingLedgerLine, BadgeTone>> = {
  soporte: 'neutral',
  proyecto: 'brand',
};

const formatAmount = (entry: BillingLedgerEntry) => formatMoney(entry.amount, entry.currency);

const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');

type DialogState =
  | { kind: 'issue-milestone'; entry: BillingLedgerEntry }
  | { kind: 'pay-milestone'; entry: BillingLedgerEntry }
  | { kind: 'pay-support-invoice'; entry: BillingLedgerEntry }
  | null;

/**
 * Libro combinado de Facturación (rol Finanzas) — une Soporte y Proyectos en
 * una sola tabla, sobre `GET /support-invoices/billing-ledger`. No reemplaza
 * a `/facturacion-soporte`: esa sigue siendo el panel de detalle por contrato
 * que admin/pmo ya usaban; este es el libro plano que Finanzas necesita para
 * gestionar ambas líneas desde una sola pantalla — ver `kora-perfil-finanzas.html`.
 */
export function BillingLedgerPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useBillingLedger();
  const entries = data?.entries ?? [];

  const [segment, setSegment] = useState<SegmentFilter>('todas');
  const [status, setStatus] = useState<StatusFilter>('todos');
  const [clientFilter, setClientFilter] = useState('all');
  const [dialog, setDialog] = useState<DialogState>(null);

  const issueMilestoneInvoice = useIssueProjectPaymentMilestoneInvoice();
  const markMilestonePaid = useMarkProjectPaymentMilestonePaid();
  const markSupportInvoicePaid = useMarkSupportInvoicePaid('');

  const canManageBilling = can('projects:manage');
  const { data: billingSettings } = useProjectBillingSettings();
  const updateBillingSettings = useUpdateProjectBillingSettings();

  // Solo se carga el proyecto completo cuando hace falta decidir el aviso de
  // Hito 0 del diálogo de pago — el libro no trae `sortOrder` ni el estado del
  // proyecto por fila, así que se resuelve bajo demanda con el mismo hook que
  // usa la ficha del proyecto.
  const { data: milestoneProject } = useProjectDetail(
    dialog?.kind === 'pay-milestone' ? dialog.entry.projectId : null,
  );

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of entries) seen.set(entry.clientId, entry.clientName);
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ value: id, label: name }));
  }, [entries]);

  const baseFiltered = useMemo(() => {
    return entries.filter((entry) => {
      if (segment !== 'todas' && entry.line !== segment) return false;
      if (clientFilter !== 'all' && entry.clientId !== clientFilter) return false;
      return true;
    });
  }, [entries, segment, clientFilter]);

  const rows = useMemo(() => {
    if (status === 'todos') return baseFiltered;
    return baseFiltered.filter((entry) => entry.status === status);
  }, [baseFiltered, status]);

  // Sumar montos de monedas distintas inventaría un número sin sentido (era exactamente el bug que tenía esta página: UF de Soporte
  // sumándose con CLP de Proyectos como si fueran lo mismo) — un grupo de KPIs por cada moneda presente entre las filas filtradas.
  const kpisByCurrency = useMemo(() => {
    const groups = new Map<string, { toInvoice: number; invoiced: number; paid: number; overdue: number }>();
    for (const entry of baseFiltered) {
      let group = groups.get(entry.currency);
      if (!group) {
        group = { toInvoice: 0, invoiced: 0, paid: 0, overdue: 0 };
        groups.set(entry.currency, group);
      }
      if (entry.status === 'pendiente') group.toInvoice += entry.amount;
      else if (entry.status === 'facturado') group.invoiced += entry.amount;
      else if (entry.status === 'atrasado') group.overdue += entry.amount;
      else if (entry.status === 'pagado') group.paid += entry.amount;
    }
    return [...groups.entries()].map(([currency, totals]) => ({ currency: currency as BillingLedgerEntry['currency'], ...totals }));
  }, [baseFiltered]);

  const closeDialog = () => setDialog(null);

  const onIssueMilestoneInvoice = async (input: IssueProjectPaymentMilestoneInvoiceInput) => {
    if (dialog?.kind !== 'issue-milestone' || !dialog.entry.projectId) return;
    await issueMilestoneInvoice.mutateAsync({
      projectId: dialog.entry.projectId,
      milestoneId: dialog.entry.referenceId as string,
      input,
    });
    await queryClient.invalidateQueries({ queryKey: billingKeys.ledger() });
    toast.success('Factura registrada correctamente.');
  };

  const onMarkMilestonePaid = async (input: MarkProjectPaymentMilestonePaidInput) => {
    if (dialog?.kind !== 'pay-milestone' || !dialog.entry.projectId) return;
    await markMilestonePaid.mutateAsync({
      projectId: dialog.entry.projectId,
      milestoneId: dialog.entry.referenceId as string,
      input,
    });
    await queryClient.invalidateQueries({ queryKey: billingKeys.ledger() });
    toast.success('Pago registrado correctamente.');
  };

  const onMarkSupportInvoicePaid = async (input: MarkSupportInvoicePaidInput) => {
    if (dialog?.kind !== 'pay-support-invoice' || !dialog.entry.referenceId) return;
    await markSupportInvoicePaid.mutateAsync({ invoiceId: dialog.entry.referenceId, input });
    await queryClient.invalidateQueries({ queryKey: billingKeys.ledger() });
    toast.success('Pago registrado correctamente.');
  };

  const showHito0Notice = useMemo(() => {
    if (dialog?.kind !== 'pay-milestone' || !milestoneProject) return false;
    if (milestoneProject.salesStage !== 'approved' || milestoneProject.status !== 'draft') return false;
    const minSortOrder = Math.min(...milestoneProject.paymentMilestones.map((m) => m.sortOrder));
    const milestone = milestoneProject.paymentMilestones.find((m) => m.id === dialog.entry.referenceId);
    return milestone !== undefined && milestone.sortOrder === minSortOrder;
  }, [dialog, milestoneProject]);

  const onToggleAutoActivate = async (checked: boolean) => {
    try {
      await updateBillingSettings.mutateAsync({ autoActivateFirstPayment: checked });
      toast.success(checked ? 'Se activó la activación automática de Hito 0.' : 'Se desactivó la activación automática de Hito 0.');
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : 'No se pudo actualizar la configuración.');
    }
  };

  const renderAction = (entry: BillingLedgerEntry) => {
    if (entry.line === 'proyecto') {
      if (entry.status === 'pendiente') {
        return (
          <Button size="sm" onClick={() => setDialog({ kind: 'issue-milestone', entry })}>
            Subir factura
          </Button>
        );
      }
      if (entry.status === 'facturado') {
        return (
          <Button size="sm" onClick={() => setDialog({ kind: 'pay-milestone', entry })}>
            Marcar pagado
          </Button>
        );
      }
      return <span className={styles.noAction}>—</span>;
    }

    // Soporte: la fila "pendiente" (período vigente sin factura todavía) no
    // tiene una factura real que registrar acá — ver docs del endpoint; para
    // eso sigue existiendo `/facturacion-soporte` y la ficha del contrato.
    if (entry.status === 'facturado' || entry.status === 'atrasado') {
      return (
        <Button size="sm" onClick={() => setDialog({ kind: 'pay-support-invoice', entry })}>
          Marcar pagado
        </Button>
      );
    }
    return <span className={styles.noAction}>—</span>;
  };

  const columns: Column<BillingLedgerEntry>[] = [
    { key: 'client', header: 'Cliente', render: (e) => e.clientName },
    { key: 'line', header: 'Línea', render: (e) => <Badge tone={LINE_TONE[e.line]}>{BILLING_LEDGER_LINE_LABELS[e.line]}</Badge> },
    { key: 'detail', header: 'Detalle', render: (e) => e.detail },
    { key: 'amount', header: 'Monto', align: 'right', render: formatAmount },
    { key: 'folio', header: 'N° factura', render: (e) => e.folio ?? '—' },
    { key: 'issuedAt', header: 'Fecha emisión', render: (e) => formatDate(e.issuedAt) },
    { key: 'status', header: 'Estado', render: (e) => <Badge tone={STATUS_TONE[e.status]}>{BILLING_LEDGER_STATUS_LABELS[e.status]}</Badge> },
    { key: 'paidAt', header: 'Fecha de pago', render: (e) => formatDate(e.paidAt) },
    { key: 'action', header: '', render: renderAction },
  ];

  const downloadExcel = () => {
    if (rows.length === 0) {
      toast.error('No hay datos para los filtros seleccionados.');
      return;
    }
    const header = ['Cliente', 'Línea', 'Detalle', 'Monto', 'N° factura', 'Fecha emisión', 'Estado', 'Fecha de pago'];
    const csv = [header.join(';')]
      .concat(
        rows.map((e) =>
          [
            e.clientName,
            BILLING_LEDGER_LINE_LABELS[e.line],
            e.detail,
            formatAmount(e),
            e.folio ?? '',
            e.issuedAt ?? '',
            BILLING_LEDGER_STATUS_LABELS[e.status],
            e.paidAt ?? '',
          ].join(';'),
        ),
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `facturacion-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (rows.length === 0) {
      toast.error('No hay datos para los filtros seleccionados.');
      return;
    }
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('El navegador bloqueó la ventana emergente. Habilítala para generar el PDF.');
      return;
    }
    const tableRows = rows
      .map(
        (e) =>
          `<tr><td>${e.clientName}</td><td>${BILLING_LEDGER_LINE_LABELS[e.line]}</td><td>${e.detail}</td><td>${formatAmount(e)}</td><td>${e.folio ?? '—'}</td><td>${formatDate(e.issuedAt)}</td><td>${BILLING_LEDGER_STATUS_LABELS[e.status]}</td><td>${formatDate(e.paidAt)}</td></tr>`,
      )
      .join('');
    win.document.write(`<html><head><title>Facturación — Kora</title><style>
      body{font-family:Arial,sans-serif;padding:30px;color:#111;}
      h1{font-size:18px;margin-bottom:2px;}
      p.meta{color:#666;font-size:12px;margin-top:0;}
      table{width:100%;border-collapse:collapse;margin-top:16px;}
      th,td{border:1px solid #ddd;padding:8px 10px;font-size:12px;text-align:left;}
      th{background:#f5f6fa;}
    </style></head><body>
      <h1>Facturación — Kora</h1>
      <p class="meta">Generado el ${new Date().toLocaleDateString('es-CL')}</p>
      <table><thead><tr><th>Cliente</th><th>Línea</th><th>Detalle</th><th>Monto</th><th>N° Factura</th><th>Fecha emisión</th><th>Estado</th><th>Fecha de pago</th></tr></thead>
      <tbody>${tableRows}</tbody></table>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <DashboardLayout title="Facturación">
      <div className={styles.page}>
        <div className={styles.pageHead}>
          <div>
            <h1 className={styles.title}>Facturación</h1>
            <p className={styles.subtitle}>Registra facturas, marca su estado y deja constancia de los pagos recibidos — de Soporte y de Proyectos.</p>
          </div>
        </div>

        {canManageBilling ? (
          <Card className={styles.hito0Settings}>
            <Switch
              checked={billingSettings?.autoActivateFirstPayment ?? false}
              onChange={(checked) => void onToggleAutoActivate(checked)}
              label="Activación automática de Hito 0"
              disabled={updateBillingSettings.isPending}
            />
            <span className={styles.hito0SettingsLabel}>Activación automática de Hito 0</span>
          </Card>
        ) : (
          can('billing:read') &&
          billingSettings && (
            <Card className={styles.hito0Settings}>
              <span className={styles.hito0SettingsLabel}>
                Hito 0 automático: <b>{billingSettings.autoActivateFirstPayment ? 'Activado' : 'Desactivado'}</b>
              </span>
            </Card>
          )
        )}

        {(kpisByCurrency.length > 0 ? kpisByCurrency : [{ currency: 'UF' as const, toInvoice: 0, invoiced: 0, paid: 0, overdue: 0 }]).map((group) => {
          const tag = kpisByCurrency.length > 1 ? ` (${group.currency})` : '';
          return (
            <div className={styles.kpis} key={group.currency}>
              <KpiCard label={`Por facturar${tag}`} value={isLoading ? '…' : formatMoney(group.toInvoice, group.currency)} />
              <KpiCard label={`Facturado por cobrar${tag}`} value={isLoading ? '…' : formatMoney(group.invoiced, group.currency)} />
              <KpiCard label={`Pagado${tag}`} value={isLoading ? '…' : formatMoney(group.paid, group.currency)} />
              <KpiCard label={`Atrasado${tag}`} tone="danger" value={isLoading ? '…' : formatMoney(group.overdue, group.currency)} />
            </div>
          );
        })}

        <div className={styles.toolbar}>
          <Tabs tabs={SEGMENT_TABS} activeId={segment} onSelect={(id) => setSegment(id as SegmentFilter)} />
          <Tabs tabs={STATUS_TABS} activeId={status} onSelect={(id) => setStatus(id as StatusFilter)} />
          <Select
            aria-label="Cliente"
            options={[{ value: 'all', label: 'Todos los clientes' }, ...clientOptions]}
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value)}
            className={styles.clientSelect}
          />
          <div className={styles.toolbarFill} />
          <Button variant="outline" size="sm" onClick={downloadExcel}>
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            PDF
          </Button>
        </div>

        <Card>
          <DataTable
            caption="Facturación de Soporte y Proyectos"
            columns={columns}
            items={rows}
            getRowKey={(e) => e.id}
            loading={isLoading}
            error={null}
            emptyMessage="No hay resultados para estos filtros."
          />
        </Card>
      </div>

      <IssueProjectMilestoneInvoiceDialog
        open={dialog?.kind === 'issue-milestone'}
        milestoneName={dialog?.kind === 'issue-milestone' ? dialog.entry.detail : ''}
        amount={dialog?.kind === 'issue-milestone' ? dialog.entry.amount : 0}
        onClose={closeDialog}
        onConfirm={onIssueMilestoneInvoice}
      />

      <MarkProjectMilestonePaidDialog
        open={dialog?.kind === 'pay-milestone'}
        milestoneName={dialog?.kind === 'pay-milestone' ? dialog.entry.detail : ''}
        showHito0Notice={showHito0Notice}
        onClose={closeDialog}
        onConfirm={onMarkMilestonePaid}
      />

      <MarkSupportInvoicePaidDialog
        open={dialog?.kind === 'pay-support-invoice'}
        folio={dialog?.kind === 'pay-support-invoice' ? (dialog.entry.folio ?? '') : ''}
        onClose={closeDialog}
        onConfirm={onMarkSupportInvoicePaid}
      />
    </DashboardLayout>
  );
}
