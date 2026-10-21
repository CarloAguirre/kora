import type { EstimationImpact, EstimationStatus } from '@kora/contracts';

export const ESTIMATION_STATUS_LABELS: Readonly<Record<EstimationStatus, string>> = {
  draft: 'Borrador',
  analyzing_sources: 'Analizando antecedentes',
  awaiting_answers: 'Esperando aclaraciones',
  ready_to_estimate: 'Listo para estimar',
  estimating: 'Generando EDT',
  completed: 'Estimación completada',
  failed: 'Error',
};

export const ESTIMATION_IMPACT_LABELS: Readonly<Record<EstimationImpact, string>> = {
  high: 'Alto',
  medium: 'Medio',
  low: 'Bajo',
};
