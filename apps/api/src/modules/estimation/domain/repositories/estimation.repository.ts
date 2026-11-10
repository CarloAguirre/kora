import type { EstimationResult, ProjectEstimationContext } from '@kora/contracts';

export const ESTIMATION_REPOSITORY = Symbol('ESTIMATION_REPOSITORY');

/**
 * Puerto de persistencia del agregado de estimación.
 *
 * Todavía no se registra una implementación: el modelo físico se cerrará
 * cuando definamos versionado/refresco de fuentes. Declarar el puerto ahora
 * evita acoplar los próximos casos de uso a Drizzle.
 */
export interface EstimationRepository {
  saveContext(projectId: string, context: ProjectEstimationContext): Promise<void>;
  getContext(projectId: string): Promise<ProjectEstimationContext | null>;
  saveResult(projectId: string, result: EstimationResult): Promise<void>;
  getLatestResult(projectId: string): Promise<EstimationResult | null>;
}
