import type { ClientDetail, ProjectSummary, SupportPlanListItem } from '@kora/contracts';
import { getProjectStageLabel } from '@/modules/projects/lib/project-stage-display';
import type { ClientCompanyInfo, ClientProjectHealth, ClientProjectRow, ClientSupportContractRow } from '../types';

/** Traduce las listas reales del cliente (`GET /projects`, `GET /support-plans/client/:id`) a las filas del portal — ver `docs/DECISION-PORTAL-CLIENTE.md`. */

function formatDMY(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(`${iso}T00:00:00`);
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

/**
 * Estado que ve el cliente, igual en la lista y en el detalle: solo estados reales del proyecto
 * (`status`) y de la etapa comercial (`salesStage`), con la misma prioridad que
 * `getProjectStageLabel` (Finalizado/Cancelado/Detenido antes que la etapa comercial). No se
 * deriva un "En riesgo" del atraso: no es un estado del proyecto.
 */
export function projectHealth(project: Pick<ProjectSummary, 'status' | 'salesStage'>): ClientProjectHealth {
  if (project.status === 'finished') return 'finished';
  if (project.status === 'cancelled') return 'cancelled';
  if (project.status === 'on_hold') return 'on_hold';
  if (project.salesStage === 'prospect') return 'prospect';
  if (project.salesStage === 'quoted') return 'quoted';
  if (project.status === 'draft') return 'not_started';
  return 'active';
}

export function toClientCompanyInfo(client: ClientDetail): ClientCompanyInfo {
  const matchingContact = client.contacts.find((contact) => contact.email === client.primaryContactEmail);
  return {
    name: client.companyName,
    contactName: client.primaryContactName ?? '—',
    contactPosition: matchingContact?.position ?? '',
    logoUrl: client.logoDataUrl,
  };
}

export function toClientProjectRow(project: ProjectSummary): ClientProjectRow {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    leaderName: project.leader?.fullName ?? '—',
    startDate: formatDMY(project.startDate),
    endDate: project.endDate ? formatDMY(project.endDate) : null,
    startDateIso: project.startDate ?? null,
    endDateIso: project.endDate ?? null,
    health: projectHealth(project),
    // Misma etiqueta que la columna "Etapa" interna: solo con `phase`, un Prospecto/Cotización (sin fase) salía "Sin etapa".
    stageLabel: getProjectStageLabel(project),
    progressPercent: project.progress.actual,
  };
}

export function toClientSupportContractRow(plan: SupportPlanListItem): ClientSupportContractRow {
  const billingLabel =
    plan.currentBillingStatus === 'invoiced' ? 'Facturada' : plan.currentBillingStatus === 'to_invoice' ? 'Por Facturar' : '--';
  return {
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    planType: plan.planType,
    kabeliOwnerName: plan.leaderName ?? '—',
    startDate: formatDMY(plan.startDate),
    endDate: plan.endDate ? formatDMY(plan.endDate) : null,
    startDateIso: plan.startDate ?? null,
    endDateIso: plan.endDate ?? null,
    contractedHours: plan.contractedHours || null,
    consumedHours: plan.usedHours,
    hourValueUf: plan.planValueUf || null,
    currency: plan.currency,
    billingState: billingLabel,
    contractStatus: plan.status === 'active' ? 'active' : 'finished',
  };
}
