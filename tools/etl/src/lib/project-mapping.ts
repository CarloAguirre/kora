import type { ProjectPhase, ProjectSalesStage, ProjectStatus, ProjectType } from '@kora/contracts';

/**
 * Equivalencias del modelo de proyecto. Ver docs/DECISION-M3-ESTADOS.md para
 * el porqué de cada regla: está resuelto con evidencia del esquema legado
 * (el CHECK constraint de `estado_proyecto` nunca admitió 'Finalizado'), no
 * por interpretación.
 */

export function mapProjectType(legacyTipoProyecto: string | null): ProjectType {
  return legacyTipoProyecto?.trim() === 'Soporte' ? 'support' : 'development';
}

export function mapSalesStage(legacyTipoProyecto: string | null): ProjectSalesStage | null {
  switch (legacyTipoProyecto?.trim()) {
    case 'Prospecto':
      return 'prospect';
    case 'Cotización':
      return 'quoted';
    case 'Aprobado':
      return 'approved';
    default:
      return null;
  }
}

/**
 * `estado_proyecto` es la fuente de verdad del ciclo administrativo, EXCEPTO
 * cuando `etapa`/`fase_proyecto` dicen 'Finalizado' — algo que
 * `estado_proyecto` nunca pudo expresar por su propio CHECK constraint.
 */
export function mapProjectStatus(
  legacyEtapa: string | null,
  legacyFaseProyecto: string | null,
  legacyEstadoProyecto: string | null,
): ProjectStatus {
  const finished =
    legacyEtapa?.trim() === 'Finalizado' || legacyFaseProyecto?.trim() === 'Finalizado';
  if (finished) return 'finished';

  switch (legacyEstadoProyecto?.trim()) {
    case 'Detenido':
      return 'on_hold';
    case 'No Iniciado':
      return 'draft';
    case 'Inactivo':
      return 'cancelled';
    default:
      return 'active';
  }
}

export function mapProjectPhase(legacyFaseProyecto: string | null): ProjectPhase | null {
  switch (legacyFaseProyecto?.trim()) {
    case 'Levantamiento':
      return 'discovery';
    case 'En Desarrollo':
      return 'development';
    case 'Marcha Blanca':
      return 'pilot';
    case 'Finalizado':
      return 'closed';
    default:
      return null;
  }
}

export function mapPriority(legacyPrioridad: string | null): 'low' | 'medium' | 'high' | null {
  switch (legacyPrioridad?.trim()) {
    case 'Alta':
      return 'high';
    case 'Media':
      return 'medium';
    case 'Baja':
      return 'low';
    default:
      return null;
  }
}
