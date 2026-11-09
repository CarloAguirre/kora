import {
  quotationDraftDataSchema,
  type QuotationDraftData,
} from '@kora/contracts';

/**
 * Una versión copiada sigue siendo una versión comercial independiente
 * (origin=copy), pero una copia dentro del mismo proyecto debe conservar
 * su desglose WBS, los cambios de HH por tarea y su trazabilidad IA original.
 *
 * Sin este snapshot, quotationEdtAssignments y el Roadmap aplicado perderían
 * todas las referencias aunque las fases comerciales conservaran las HH.
 *
 * Una copia hacia OTRO proyecto no puede llevar evidencia/tokens/referencias
 * del proyecto anterior. Las copias manuales o del fixture KDM mantienen el
 * comportamiento histórico: conservar presupuesto, descartar artefactos IA.
 */
export function copyQuotationDraft(
  previous: QuotationDraftData,
  sourceProjectId: string,
  destinationProjectId: string,
): QuotationDraftData {
  const snapshot = previous.aiPoc;
  const preserveRealDriveEdt =
    sourceProjectId === destinationProjectId &&
    snapshot?.source === 'drive' &&
    snapshot.proposal.sourceMode === 'drive' &&
    snapshot.proposal.projectId === destinationProjectId &&
    snapshot.edt?.source === 'drive' &&
    ['gemini', 'openai'].includes(snapshot.edt.provider) &&
    snapshot.edt.provider === snapshot.proposal.provider;

  if (preserveRealDriveEdt) {
    // Zod crea el nuevo draft y valida los metadatos copiados; no altera v1.
    // Se conservan aiPoc.edt, overrides WBS/roles, nuevas tareas comerciales,
    // sourceRefs, respuestas y el estado de conciliación para que no se
    // puedan traspasar HH divergentes sin revisión explícita.
    return quotationDraftDataSchema.parse(previous);
  }

  return quotationDraftDataSchema.parse({
    ...previous,
    sourceRefs: [],
    answers: {},
    analysis: null,
    aiPoc: null,
    analysisProjectionStatus: undefined,
    edtHourAdjustments: undefined,
    edtTaskSettings: undefined,
    edtRoleCollaborators: undefined,
    edtStageSettings: undefined,
    edtCommercialStages: undefined,
    edtCommercialTasks: undefined,
    edtTaskNames: undefined,
  });
}
