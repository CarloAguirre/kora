import type { ClientDetail, ProjectPhase, ProjectSummary, SupportPlanListItem } from '@kora/contracts';
import type { ClientCompanyInfo, ClientProjectHealth, ClientProjectRow, ClientSupportContractRow } from '../types';

/** Traduce las listas reales del cliente (`GET /projects`, `GET /support-plans/client/:id`) a las filas del portal — ver `docs/DECISION-PORTAL-CLIENTE.md`. */

function formatDMY(iso: string | null | undefined): string {
  if (!iso) return '--';
  const date = new Date(`${iso}T00:00:00`);
  return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
}

const PHASE_LABELS: Readonly<Record<ProjectPhase, string>> = {
  discovery: 'Levantamiento',
  development: 'Desarrollo',
  testing: 'Pruebas',
  pilot: 'Marcha blanca',
  closed: 'Finalizado',
};

function health(status: ProjectSummary['status']): ClientProjectHealth {
  if (status === 'finished') return 'finished';
  if (status === 'on_hold') return 'at_risk';
  return 'active';
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
    health: health(project.status),
    stageLabel: project.phase ? PHASE_LABELS[project.phase] : 'Sin etapa',
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
