import { isDeepStrictEqual } from 'node:util';
import type { QuotationDraftData } from '@kora/contracts';

export class QuotationAnalysisIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotationAnalysisIntegrityError';
  }
}

const commercialFields = [
  'teams', 'phases', 'costs', 'paymentPlan', 'assumptions', 'exclusions',
] as const;

/**
 * Valida la inmutabilidad de la evidencia y determina la conciliación en API.
 * Nunca confiar en analysisProjectionStatus ni en el artefacto devuelto
 * por el navegador. La versión fuente sigue disponible para reconstruir
 * el EDT/ERS y explicar el origen de las HH.
 */
export function reconcileQuotationAnalysis(
  saved: QuotationDraftData,
  incoming: QuotationDraftData,
): QuotationDraftData {
  if (!saved.analysis) {
    if (incoming.analysis) {
      throw new QuotationAnalysisIntegrityError(
        'El análisis IA se incorpora únicamente mediante la creación de una nueva versión.',
      );
    }
    return { ...incoming, analysis: null, analysisProjectionStatus: undefined };
  }

  if (!isDeepStrictEqual(saved.analysis, incoming.analysis)) {
    throw new QuotationAnalysisIntegrityError(
      'No se puede sobrescribir ni quitar la evidencia original del análisis IA.',
    );
  }
  if (!isDeepStrictEqual(saved.sourceRefs, incoming.sourceRefs) ||
      !isDeepStrictEqual(saved.answers, incoming.answers)) {
    throw new QuotationAnalysisIntegrityError(
      'Las fuentes y respuestas originales deben conservarse durante la edición.',
    );
  }

  const changed = commercialFields.some((key) =>
    !isDeepStrictEqual(saved[key], incoming[key]));
  return {
    ...incoming,
    analysis: saved.analysis,
    sourceRefs: saved.sourceRefs,
    answers: saved.answers,
    analysisProjectionStatus:
      saved.analysisProjectionStatus === 'modified' || changed ? 'modified' : 'synced',
  };
}
