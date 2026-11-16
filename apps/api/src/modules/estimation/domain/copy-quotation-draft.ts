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
 * Una copia hacia OTRO proyecto conserva las actividades y HH como plantilla
 * comercial, pero sin documentos, citas, respuestas ni procedencia IA del
 * proyecto origen. Los fixtures KDM no constituyen una EDT reutilizable.
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

  const preserveLocalTemplate = sourceProjectId === destinationProjectId &&
    snapshot?.source === 'copied_template' &&
    snapshot.edt?.source === 'copied_template';
  if (preserveRealDriveEdt || preserveLocalTemplate) {
    // Zod crea el nuevo draft y valida los metadatos copiados; no altera v1.
    // Se conservan aiPoc.edt, overrides WBS/roles, nuevas tareas comerciales,
    // sourceRefs, respuestas y el estado de conciliación para que no se
    // puedan traspasar HH divergentes sin revisión explícita.
    return quotationDraftDataSchema.parse(previous);
  }

  // Mantener el desglose comercial sin fingir que la carpeta del origen
  // corresponde al destino. La plantilla sigue inmutable tras su creación.
  if (snapshot?.edt && (snapshot.source === 'drive' ||
      snapshot.source === 'copied_template')) {
    return quotationDraftDataSchema.parse({
      ...previous,
      sourceRefs: [],
      answers: {},
      analysis: null,
      aiPoc: {
        ...snapshot,
        source: 'copied_template',
        proposal: {
          ...snapshot.proposal,
          projectId: destinationProjectId,
          sourceMode: 'copied_template',
          documentsAnalyzed: 0,
          summary: 'Plantilla de tareas y HH copiada; sin evidencia documental del proyecto destino.',
          assumptions: [],
          clarifyingQuestions: [],
        },
        answers: [],
        dynamicQuestions: [],
        confirmedUnderstanding: null,
        edt: {
          ...snapshot.edt,
          source: 'copied_template',
          modules: snapshot.edt.modules.map((module) => ({
            ...module,
            tasks: module.tasks.map(({ referenceIds: _references, ...task }) => task),
          })),
        },
      },
    });
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
