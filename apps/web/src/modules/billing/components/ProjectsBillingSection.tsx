import { usePermissions } from "@/modules/auth/hooks/usePermissions";
import {
  useIssueProjectPaymentMilestoneInvoice,
  useMarkProjectPaymentMilestonePaid,
  useProjectBillingSettings,
  useProjectDetail,
  useUpdateProjectBillingSettings,
} from "@/modules/projects/api/projects.queries";
import { IssueProjectMilestoneInvoiceDialog } from "@/modules/projects/components/IssueProjectMilestoneInvoiceDialog";
import { MarkProjectMilestonePaidDialog } from "@/modules/projects/components/MarkProjectMilestonePaidDialog";
import { Badge, type BadgeTone } from "@/shared/components/ui/Badge";
import { Button } from "@/shared/components/ui/Button";
import {
  DataTable,
  type Column,
  type SortState,
} from "@/shared/components/ui/DataTable";
import { KpiCard } from "@/shared/components/ui/KpiCard";
import { MultiSelect } from "@/shared/components/ui/MultiSelect";
import { Tabs } from "@/shared/components/ui/Tabs";
import { useToast } from "@/shared/components/ui/Toast";
import { ApiRequestError } from "@/shared/lib/api-client";
import { formatMoney } from "@/shared/lib/format-money";
import {
  compareSortValues,
  nextSortState,
  type SortValue,
} from "@/shared/lib/sort";
import type {
  BillingLedgerEntry,
  IssueProjectPaymentMilestoneInvoiceInput,
  MarkProjectPaymentMilestonePaidInput,
} from "@kora/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { billingKeys } from "../api/billing.api";
import { useBillingLedger } from "../api/billing.queries";
import { ProjectMilestoneDetailPanel } from "./ProjectMilestoneDetailPanel";
import styles from "./ProjectsBillingSection.module.css";

type StatusFilter = "todos" | "activos" | "resueltos";
const STATUS_TABS: ReadonlyArray<{ id: StatusFilter; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "activos", label: "Con alerta activa" },
  { id: "resueltos", label: "Resueltos" },
];

const formatAmount = (entry: BillingLedgerEntry) =>
  formatMoney(entry.amount, entry.currency);

const projectLabel = (entry: BillingLedgerEntry) =>
  entry.projectName ?? entry.detail;

/** "Inicio (50%)" — el porcentaje solo si el tramo lo tiene configurado. */
function tramoLabel(entry: BillingLedgerEntry) {
  if (!entry.milestoneName) return "—";
  return entry.milestonePercent !== null
    ? `${entry.milestoneName} (${entry.milestonePercent.toLocaleString("es-CL")}%)`
    : entry.milestoneName;
}

/** Antes de tener factura, "pendiente" no distingue estado de pago — no hay nada que mostrar todavía. */
function facturacionLabel(status: BillingLedgerEntry["status"]) {
  return status === "pendiente" ? "Por facturar" : "Facturado";
}
function facturacionTone(status: BillingLedgerEntry["status"]): BadgeTone {
  return status === "pendiente" ? "warning" : "info";
}
function pagoLabel(status: BillingLedgerEntry["status"]) {
  return (
    { facturado: "Pago pendiente", atrasado: "Atrasado", pagado: "Pagado" }[
      status as "facturado" | "atrasado" | "pagado"
    ] ?? null
  );
}
const PAGO_TONE: Readonly<
  Record<"facturado" | "atrasado" | "pagado", BadgeTone>
> = { facturado: "info", atrasado: "danger", pagado: "success" };
function pagoTone(status: BillingLedgerEntry["status"]): BadgeTone {
  return PAGO_TONE[status as "facturado" | "atrasado" | "pagado"] ?? "neutral";
}

/** Los estados se ordenan por su avance en el flujo de cobro, no alfabéticamente. Sin estado de pago (aún por facturar) queda al final. */
const PAGO_ORDER: Readonly<
  Record<"facturado" | "atrasado" | "pagado", number>
> = { facturado: 0, atrasado: 1, pagado: 2 };

type SortField =
  "client" | "detail" | "tramo" | "amount" | "billing" | "payment";
const SORT_VALUE: Record<SortField, (entry: BillingLedgerEntry) => SortValue> =
  {
    client: (e) => e.clientName,
    detail: projectLabel,
    tramo: (e) => (e.milestoneName ? tramoLabel(e) : null),
    amount: (e) => e.amount,
    billing: (e) => (e.status === "pendiente" ? 0 : 1),
    payment: (e) =>
      PAGO_ORDER[e.status as "facturado" | "atrasado" | "pagado"] ?? null,
  };

type DialogState = {
  kind: "issue-milestone" | "pay-milestone";
  entry: BillingLedgerEntry;
} | null;

/**
 * Contenido de la pestaña "Proyectos" de `/facturacion` — tramos de pago de
 * proyecto (`line: 'proyecto'` del libro combinado de `useBillingLedger`).
 * Reutiliza los mismos diálogos que ya existían para subir factura/marcar
 * pagado en vez de abrir un panel lateral con formularios propios — evita
 * duplicar esa lógica en dos sitios (ver nota equivalente en
 * `SupportBillingSection`).
 */
export function ProjectsBillingSection() {
  const { can } = usePermissions();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useBillingLedger();
  const entries = useMemo(
    () => (data?.entries ?? []).filter((e) => e.line === "proyecto"),
    [data],
  );

  const [status, setStatus] = useState<StatusFilter>("todos");
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  // `null` = el orden en que llegan de la API (más recientes primero), hasta que se hace clic en un encabezado.
  const [sort, setSort] = useState<SortState<SortField> | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [detailEntry, setDetailEntry] = useState<BillingLedgerEntry | null>(
    null,
  );

  const issueMilestoneInvoice = useIssueProjectPaymentMilestoneInvoice();
  const markMilestonePaid = useMarkProjectPaymentMilestonePaid();

  const canManageBilling = can("projects:manage");
  const { data: billingSettings } = useProjectBillingSettings();
  const updateBillingSettings = useUpdateProjectBillingSettings();

  const { data: milestoneProject } = useProjectDetail(
    dialog?.kind === "issue-milestone" ? dialog.entry.projectId : null,
  );

  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const entry of entries) seen.set(entry.clientId, entry.clientName);
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [entries]);

  // Excel y PDF exportan estas mismas filas, así que respetan también el orden elegido.
  const rows = useMemo(() => {
    const filtered = entries.filter((entry) => {
      if (clientFilter.length > 0 && !clientFilter.includes(entry.clientId))
        return false;
      if (status === "activos") return entry.status !== "pagado";
      if (status === "resueltos") return entry.status === "pagado";
      return true;
    });
    if (!sort) return filtered;
    const valueOf = SORT_VALUE[sort.field];
    return filtered.sort((a, b) =>
      compareSortValues(valueOf(a), valueOf(b), sort.direction),
    );
  }, [entries, status, clientFilter, sort]);

  // Sumar monedas distintas inventaría un número sin sentido — hoy `proyecto` siempre es UF, pero se agrupa igual por si eso cambia.
  const kpisByCurrency = useMemo(() => {
    const groups = new Map<
      string,
      { toInvoice: number; invoiced: number; paid: number; overdue: number }
    >();
    for (const entry of entries) {
      let group = groups.get(entry.currency);
      if (!group) {
        group = { toInvoice: 0, invoiced: 0, paid: 0, overdue: 0 };
        groups.set(entry.currency, group);
      }
      if (entry.status === "pendiente") group.toInvoice += entry.amount;
      else if (entry.status === "facturado") group.invoiced += entry.amount;
      else if (entry.status === "atrasado") group.overdue += entry.amount;
      else if (entry.status === "pagado") group.paid += entry.amount;
    }
    return [...groups.entries()].map(([currency, totals]) => ({
      currency: currency as BillingLedgerEntry["currency"],
      ...totals,
    }));
  }, [entries]);

  const closeDialog = () => setDialog(null);

  const onIssueMilestoneInvoice = async (
    input: IssueProjectPaymentMilestoneInvoiceInput,
  ) => {
    if (dialog?.kind !== "issue-milestone" || !dialog.entry.projectId) return;
    await issueMilestoneInvoice.mutateAsync({
      projectId: dialog.entry.projectId,
      milestoneId: dialog.entry.referenceId as string,
      input,
    });
    await queryClient.invalidateQueries({ queryKey: billingKeys.ledger() });
    toast.success("Factura registrada correctamente.");
  };

  const onMarkMilestonePaid = async (
    input: MarkProjectPaymentMilestonePaidInput,
  ) => {
    if (dialog?.kind !== "pay-milestone" || !dialog.entry.projectId) return;
    await markMilestonePaid.mutateAsync({
      projectId: dialog.entry.projectId,
      milestoneId: dialog.entry.referenceId as string,
      input,
    });
    await queryClient.invalidateQueries({ queryKey: billingKeys.ledger() });
    toast.success("Pago registrado correctamente.");
  };

  const invoiceDialogIsFirstMilestone = useMemo(() => {
    if (dialog?.kind !== "issue-milestone" || !milestoneProject) return false;
    if (milestoneProject.salesStage !== "approved") return false;
    const minSortOrder = Math.min(
      ...milestoneProject.paymentMilestones.map((m) => m.sortOrder),
    );
    const milestone = milestoneProject.paymentMilestones.find(
      (m) => m.id === dialog.entry.referenceId,
    );
    return milestone !== undefined && milestone.sortOrder === minSortOrder;
  }, [dialog, milestoneProject]);
  const showHito0Notice =
    invoiceDialogIsFirstMilestone && milestoneProject?.status === "draft";
  const showReactivationNotice =
    invoiceDialogIsFirstMilestone && milestoneProject?.status === "on_hold";

  const onToggleAutoActivate = async (checked: boolean) => {
    try {
      await updateBillingSettings.mutateAsync({
        autoActivateFirstPayment: checked,
      });
      toast.success(
        checked
          ? "Se activó la activación automática de Hito 0."
          : "Se desactivó la activación automática de Hito 0.",
      );
    } catch (error) {
      toast.error(
        error instanceof ApiRequestError
          ? error.message
          : "No se pudo actualizar la configuración.",
      );
    }
  };

  const renderAction = (entry: BillingLedgerEntry) => {
    if (entry.status === "pendiente") {
      return (
        <Button
          size="sm"
          onClick={() => setDialog({ kind: "issue-milestone", entry })}
        >
          Subir factura
        </Button>
      );
    }
    if (entry.status === "facturado") {
      return (
        <Button
          size="sm"
          onClick={() => setDialog({ kind: "pay-milestone", entry })}
        >
          Marcar pagado
        </Button>
      );
    }
    return <span className={styles.noAction}>—</span>;
  };

  const columns: Column<BillingLedgerEntry>[] = [
    {
      key: "client",
      header: "Cliente",
      sortable: true,
      render: (e) => e.clientName,
    },
    {
      key: "detail",
      header: "Proyecto",
      sortable: true,
      render: (e) => (
        <button
          type="button"
          className={styles.detailLink}
          onClick={() => setDetailEntry(e)}
        >
          {projectLabel(e)}
        </button>
      ),
    },
    { key: "tramo", header: "Tramo", sortable: true, render: tramoLabel },
    {
      key: "amount",
      header: "Monto",
      align: "right",
      sortable: true,
      render: formatAmount,
    },
    {
      key: "billing",
      header: "Estado facturación",
      sortable: true,
      render: (e) => (
        <Badge tone={facturacionTone(e.status)}>
          {facturacionLabel(e.status)}
        </Badge>
      ),
    },
    {
      key: "payment",
      header: "Estado de pago",
      sortable: true,
      render: (e) =>
        pagoLabel(e.status) ? (
          <Badge tone={pagoTone(e.status)}>{pagoLabel(e.status)}</Badge>
        ) : (
          <span className={styles.noAction}>—</span>
        ),
    },
    { key: "action", header: "", render: renderAction },
  ];

  const downloadExcel = () => {
    if (rows.length === 0) {
      toast.error("No hay datos para los filtros seleccionados.");
      return;
    }
    const header = [
      "Cliente",
      "Proyecto",
      "Tramo",
      "Monto",
      "Estado facturación",
      "Estado de pago",
    ];
    const csv = [header.join(";")]
      .concat(
        rows.map((e) =>
          [
            e.clientName,
            projectLabel(e),
            tramoLabel(e),
            formatAmount(e),
            facturacionLabel(e.status),
            pagoLabel(e.status) ?? "",
          ].join(";"),
        ),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `facturacion-proyectos-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = () => {
    if (rows.length === 0) {
      toast.error("No hay datos para los filtros seleccionados.");
      return;
    }
    const win = window.open("", "_blank");
    if (!win) {
      toast.error(
        "El navegador bloqueó la ventana emergente. Habilítala para generar el PDF.",
      );
      return;
    }
    const tableRows = rows
      .map(
        (e) =>
          `<tr><td>${e.clientName}</td><td>${projectLabel(e)}</td><td>${tramoLabel(e)}</td><td>${formatAmount(e)}</td><td>${facturacionLabel(e.status)}</td><td>${pagoLabel(e.status) ?? "—"}</td></tr>`,
      )
      .join("");
    win.document
      .write(`<html><head><title>Facturación de Proyectos — Kora</title><style>
      body{font-family:Arial,sans-serif;padding:30px;color:#111;}
      h1{font-size:18px;margin-bottom:2px;}
      p.meta{color:#666;font-size:12px;margin-top:0;}
      table{width:100%;border-collapse:collapse;margin-top:16px;}
      th,td{border:1px solid #ddd;padding:8px 10px;font-size:12px;text-align:left;}
      th{background:#f5f6fa;}
    </style></head><body>
      <h1>Facturación de Proyectos — Kora</h1>
      <p class="meta">Generado el ${new Date().toLocaleDateString("es-CL")}</p>
      <table><thead><tr><th>Cliente</th><th>Proyecto</th><th>Tramo</th><th>Monto</th><th>Estado facturación</th><th>Estado de pago</th></tr></thead>
      <tbody>${tableRows}</tbody></table>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.sectionTitle}>Proyectos</p>
          <p className={styles.sectionSubtitle}>
            Cobro por tramos de proyecto, activados por el cambio de etapa.
          </p>
        </div>
      </div>
      {/* 
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
      */}

      {(kpisByCurrency.length > 0
        ? kpisByCurrency
        : [
            {
              currency: "UF" as const,
              toInvoice: 0,
              invoiced: 0,
              paid: 0,
              overdue: 0,
            },
          ]
      ).map((group) => {
        const tag = kpisByCurrency.length > 1 ? ` (${group.currency})` : "";
        return (
          <div className={styles.kpis} key={group.currency}>
            <KpiCard
              label={`Por facturar${tag}`}
              value={
                isLoading ? "…" : formatMoney(group.toInvoice, group.currency)
              }
            />
            <KpiCard
              label={`Facturado, pendiente de pago${tag}`}
              value={
                isLoading ? "…" : formatMoney(group.invoiced, group.currency)
              }
            />
            <KpiCard
              label={`Pagado${tag}`}
              value={isLoading ? "…" : formatMoney(group.paid, group.currency)}
            />
            <KpiCard
              label={`Pagos atrasados${tag}`}
              tone="danger"
              value={
                isLoading ? "…" : formatMoney(group.overdue, group.currency)
              }
            />
          </div>
        );
      })}

      <div className={styles.filtersRow}>
        <Tabs
          tabs={STATUS_TABS}
          activeId={status}
          onSelect={(id) => setStatus(id as StatusFilter)}
        />
        <div className={styles.filtersRight}>
          <MultiSelect
            label="Cliente"
            placeholder="Todos"
            searchPlaceholder="Buscar cliente"
            options={clientOptions}
            value={clientFilter}
            onChange={setClientFilter}
            className={styles.clientSelect}
          />
          <Button variant="outline" size="sm" onClick={downloadExcel}>
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf}>
            PDF
          </Button>
        </div>
      </div>

      <DataTable
        caption="Tramos de pago de proyectos"
        columns={columns}
        items={rows}
        getRowKey={(e) => e.id}
        sort={sort ?? undefined}
        onSortChange={(field) =>
          setSort((prev) => nextSortState(prev, field as SortField))
        }
        loading={isLoading}
        error={null}
        emptyMessage="No hay resultados para estos filtros."
      />

      <IssueProjectMilestoneInvoiceDialog
        open={dialog?.kind === "issue-milestone"}
        milestoneName={
          dialog?.kind === "issue-milestone" ? dialog.entry.detail : ""
        }
        amount={dialog?.kind === "issue-milestone" ? dialog.entry.amount : 0}
        showHito0Notice={showHito0Notice}
        showReactivationNotice={showReactivationNotice}
        onClose={closeDialog}
        onConfirm={onIssueMilestoneInvoice}
      />

      <MarkProjectMilestonePaidDialog
        open={dialog?.kind === "pay-milestone"}
        milestoneName={
          dialog?.kind === "pay-milestone" ? dialog.entry.detail : ""
        }
        onClose={closeDialog}
        onConfirm={onMarkMilestonePaid}
      />

      <ProjectMilestoneDetailPanel
        projectId={detailEntry?.projectId ?? null}
        milestoneId={detailEntry?.referenceId ?? null}
        onClose={() => setDetailEntry(null)}
        onIssue={() =>
          detailEntry &&
          setDialog({ kind: "issue-milestone", entry: detailEntry })
        }
        onMarkPaid={() =>
          detailEntry &&
          setDialog({ kind: "pay-milestone", entry: detailEntry })
        }
      />
    </div>
  );
}
