import type { ProjectSummary } from '@kora/contracts';

/**
 * Etiqueta "Cliente - Proyecto" para selects de proyecto (registro de horas,
 * tickets, etc.) — igual que la v1. Sin esto, proyectos con nombres iguales o
 * parecidos entre distintos clientes son indistinguibles en la lista.
 */
export function getProjectOptionLabel(project: Pick<ProjectSummary, 'name' | 'client'>): string {
  return project.client ? `${project.client.companyName} - ${project.name}` : project.name;
}
