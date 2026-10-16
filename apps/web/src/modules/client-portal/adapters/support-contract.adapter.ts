import type { SupportPlanWithInvoices, TicketDetail, TicketSummary } from '@kora/contracts';
import type {
  SupportContractDetail,
  SupportTicket,
  SupportTicketBillingStatus,
  SupportTicketPriority,
  SupportTicketWorkflowStatus,
} from '../types';

/**
 * Traduce `SupportPlanWithInvoices` (`GET /support-plans/:id`) + los tickets
 * del cliente (`GET /tickets?clientId=...`) a la ficha del portal — ver
 * `docs/DECISION-PORTAL-CLIENTE.md` y el comentario de `project-detail.adapter.ts`
 * para el mismo criterio general.
 *
 * Huecos de datos reales:
 * - El SLA del Figma ("06:53:18/8hr", tiempo exacto transcurrido) no existe:
 *   no hay un reloj de SLA por ticket en el esquema. Se muestra
 *   "usadas/estimadas" en su lugar.
 * - `tickets.evidence_url` es un solo campo; el Figma muestra hasta 2
 *   adjuntos — se listan los que haya (0 o 1).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Acepta tanto fecha sola ("2026-08-20") como datetime ISO completo
 * ("...T10:30:00.000Z", p.ej. `createdAt`/`occurredAt`). El datetime se lee
 * en UTC (no hora local): estos timestamps representan "qué día pasó esto",
 * no un instante preciso, y guardarlos a medianoche UTC + leerlos en una zona
 * horaria detrás de UTC (Chile) corría la fecha un día para atrás.
 */
function formatDMY(iso: string | null | undefined): string {
  if (!iso) return '--';
  if (iso.includes('T')) {
    const date = new Date(iso);
    return `${String(date.getUTCDate()).padStart(2, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${date.getUTCFullYear()}`;
  }
  const date = new Date(`${iso}T00:00:00`);
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

function workflowStatus(status: TicketSummary['status']): SupportTicketWorkflowStatus {
  if (status === 'pending') return 'pending';
  if (status === 'done' || status === 'closed') return 'closed';
  return 'in_progress';
}

function billingStatus(ticket: Pick<TicketSummary, 'status' | 'invoiceId'>): SupportTicketBillingStatus {
  if (ticket.invoiceId) return 'invoiced';
  if (ticket.status === 'done' || ticket.status === 'closed') return 'pending_invoice';
  return 'to_invoice';
}

function priority(value: TicketSummary['priority']): SupportTicketPriority {
  if (value === 'critical' || value === 'high') return 'high';
  if (value === 'low') return 'low';
  return 'medium';
}

function sla(estimatedHours: number | null, usedHours: number): string {
  return estimatedHours != null ? `${usedHours}h / ${estimatedHours}h` : `${usedHours}h`;
}

function supportTicketType(serviceType: TicketSummary['serviceType']): SupportTicket['type'] {
  return serviceType === 'improvement' || serviceType === 'operational' ? serviceType : 'incident';
}

/** Fila liviana para la lista y el panel de detalle antes de que cargue el detalle completo. */
export function toSupportTicketRow(item: TicketSummary): SupportTicket {
  return {
    id: item.id,
    code: item.code ?? item.id.slice(0, 8),
    type: supportTicketType(item.serviceType),
    title: item.title,
    workflowStatus: workflowStatus(item.status),
    billingStatus: billingStatus(item),
    responsibleName: item.assignee?.fullName ?? '—',
    reportDate: formatDMY(item.createdAt),
    solutionDate: null,
    estimatedHours: item.estimatedHours ?? 0,
    usedHours: item.usedHours,
    priority: priority(item.priority),
    sla: sla(item.estimatedHours, item.usedHours),
    description: item.description ?? '',
    evidenceFiles: [],
    appliedSolution: null,
    history: [],
  };
}

/** Reemplaza la fila liviana una vez carga el detalle completo del ticket seleccionado. */
export function toSupportTicketFromDetail(detail: TicketDetail): SupportTicket {
  return {
    id: detail.id,
    code: detail.code ?? detail.id.slice(0, 8),
    type: supportTicketType(detail.serviceType),
    title: detail.title,
    workflowStatus: workflowStatus(detail.status),
    billingStatus: billingStatus(detail),
    responsibleName: detail.assignee?.fullName ?? '—',
    reportDate: formatDMY(detail.createdAt),
    solutionDate: detail.resolvedAt ? formatDMY(detail.resolvedAt) : null,
    estimatedHours: detail.estimatedHours ?? 0,
    usedHours: detail.usedHours,
    priority: priority(detail.priority),
    sla: sla(detail.estimatedHours, detail.usedHours),
    description: detail.description ?? '',
    evidenceFiles: detail.evidenceUrl ? [detail.evidenceUrl] : [],
    appliedSolution: detail.resolution,
    history: detail.history.map((entry) => ({
      date: formatDMY(entry.occurredAt),
      label: entry.description,
      details: Array.isArray(entry.metadata?.details) ? (entry.metadata.details as string[]) : undefined,
    })),
  };
}

export function toSupportContractDetail(
  plan: SupportPlanWithInvoices,
  ticketsForActiveProject: readonly TicketSummary[],
): SupportContractDetail {
  const linkedProjects = plan.linkedProjects.map((p) => ({ id: p.id, name: p.name }));
  const singleProjectName = plan.scope === 'single' ? linkedProjects[0]?.name : null;

  const daysAgo30 = new Date(Date.now() - 30 * DAY_MS).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: plan.id,
    name: plan.scope === 'single' ? (singleProjectName ?? plan.name ?? 'Contrato de soporte') : (plan.name ?? 'Consolidado'),
    status: plan.status === 'active' ? 'active' : 'finished',
    company: {
      name: plan.clientName,
      contactName: plan.contact?.name ?? '—',
      contactPosition: plan.contact?.position ?? '',
    },
    scope: plan.scope,
    linkedProjects,
    description: plan.scope === 'single' && singleProjectName ? `Proyecto del contrato: ${singleProjectName}` : null,
    planType: plan.planType,
    kabeliOwnerName: plan.leaderName ?? '—',
    startDate: formatDMY(plan.startDate),
    endDate: plan.endDate ? formatDMY(plan.endDate) : '--',
    contractedHours: plan.summary.contractedHours,
    consumedHours: plan.summary.usedHours,
    currentHourValueUf: plan.summary.planValueUf,
    extraHourValueUf: plan.summary.extraHourValueUf,
    currency: plan.currency,
    rangeStartDate: formatDMY(daysAgo30),
    rangeEndDate: formatDMY(today),
    tickets: ticketsForActiveProject.map(toSupportTicketRow),
  };
}
