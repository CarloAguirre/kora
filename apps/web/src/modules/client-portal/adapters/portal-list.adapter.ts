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
 * Estado del ciclo de vida para el cliente, con la misma prioridad que `getProjectStageLabel`
 * (Finalizado/Detenido antes que la etapa comercial). `null` = proyecto aprobado y en curso:
 * cada vista decide si es "Activo" o "En riesgo" (el detalle mira el atraso, la lista no lo trae).
 */
export function lifecycleHealth(project: Pick<ProjectSummary, 'status' | 'salesStage'>): ClientProjectHealth | null {
  if (project.status === 'finished') return 'finished';
  if (project.status === 'on_hold') return 'at_risk';
  if (project.salesStage === 'prospect') return 'prospect';
  if (project.salesStage === 'quoted') return 'quoted';
  if (project.status === 'draft') return 'not_started';
  return null;
}

export function toClientCompanyInfo(client: ClientDetail): ClientCompanyInfo {
  const matchingContact = client.contacts.find((contact) => contact.email === client.primaryContactEmail);
  return {
    name: client.companyName,
    contactName: client.primaryContactName ?? '—',
    contactPosition: matchingContact?.position ?? '',
  };
}

export function toClientProjectRow(project: ProjectSummary, clientOwnerName: string): ClientProjectRow {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    typeLabel: project.type === 'development' ? 'Desarrollo' : 'Soporte',
    kabeliOwnerName: project.commercialManager?.fullName ?? '—',
    clientOwnerName,
    startDate: formatDMY(project.startDate),
    endDate: project.endDate ? formatDMY(project.endDate) : null,
    health: lifecycleHealth(project) ?? 'active',
    // Misma etiqueta que la columna "Etapa" interna: solo con `phase`, un Prospecto/Cotización (sin fase) salía "Sin etapa".
    stageLabel: getProjectStageLabel(project),
    stageProgressPercent: project.progress.actual ?? 0,
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
    contractedHours: plan.contractedHours || null,
    consumedHours: plan.usedHours,
    hourValueUf: plan.planValueUf || null,
    currency: plan.currency,
    billingState: billingLabel,
    contractStatus: plan.status === 'active' ? 'active' : 'finished',
  };
}
