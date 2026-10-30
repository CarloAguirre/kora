interface WithSlug {
  id: string;
  slug?: string | null;
}

function segment(entity: WithSlug): string {
  return entity.slug || entity.id;
}

export function clientPath(client: WithSlug): string {
  return `/clientes/${segment(client)}`;
}

export function clientPortalPreviewPath(client: WithSlug): string {
  return `${clientPath(client)}/vista-cliente`;
}

export function clientSupportPortalPreviewPath(client: WithSlug): string {
  return `${clientPortalPreviewPath(client)}/soporte`;
}

export function clientProjectPreviewPath(client: WithSlug, project: WithSlug): string {
  return `${clientPortalPreviewPath(client)}/${segment(project)}`;
}

export function clientSupportContractPreviewPath(client: WithSlug, plan: WithSlug): string {
  return `${clientSupportPortalPreviewPath(client)}/${segment(plan)}`;
}

export function projectPath(project: WithSlug): string {
  return `/proyectos/${segment(project)}`;
}

export function projectQuotationPath(project: WithSlug): string {
  return `${projectPath(project)}/cotizacion`;
}

export function projectEstimationPath(project: WithSlug): string {
  return `${projectPath(project)}/estimacion`;
}

export function projectTeamPath(project: WithSlug, team: WithSlug): string {
  return `${projectPath(project)}/equipos/${segment(team)}`;
}

export function teamPath(team: WithSlug): string {
  return `/equipos/${segment(team)}`;
}

export function teamMemberPath(team: WithSlug, memberId: string): string {
  return `${teamPath(team)}/miembros/${memberId}`;
}

export function supportPlanPath(plan: WithSlug): string {
  return `/soporte/${segment(plan)}`;
}

export function ticketPath(ticket: { id: string; legacyId?: string | null }): string {
  return `/tickets/${ticket.legacyId || ticket.id}`;
}

export function portalProjectPath(project: WithSlug): string {
  return `/portal/proyectos/${segment(project)}`;
}

export function portalSupportContractPath(plan: WithSlug): string {
  return `/portal/soporte/${segment(plan)}`;
}
