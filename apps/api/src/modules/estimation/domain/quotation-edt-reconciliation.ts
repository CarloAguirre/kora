import type {
  QuotationOperationalSnapshot, QuotationTransferPreview, QuotationVersion,
} from '@kora/contracts';

/** Sólo comparación textual, no identidad de módulos ni tareas. */
const normalizeName = (value: string) => value.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es-CL')
  .trim().replace(/\s+/g, ' ');
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function reconcileQuotationEdt(
  version: QuotationVersion,
  operational: QuotationOperationalSnapshot,
): QuotationTransferPreview['edtReconciliation'] {
  const analysis = version.draft.analysis;
  if (!analysis) return {
    source: 'no_analysis', activityCount: 0, proposedModuleCount: 0,
    proposedHours: 0, availableExistingModules: operational.executionModules ?? [], modules: [],
    notes: [
      'La versión no tiene EDT detallada. Las fases comerciales no se convierten automáticamente en módulos ni tareas de ejecución.',
    ],
  };

  const existingModules = operational.executionModules ?? [];
  const modules = analysis.modules.map((module) => {
    const existingCandidates = existingModules.filter(
      (current) => normalizeName(current.name) === normalizeName(module.name),
    );
    const activities = analysis.activities.filter((row) => row.module === module.name)
      .map((row) => ({
        wbs: row.wbs, description: row.description,
        role: row.responsibleRole, proposedHours: round(row.totalHours),
        possibleExistingTasks: existingCandidates.flatMap((candidate) =>
          candidate.tasks.filter((task) =>
            normalizeName(task.name) === normalizeName(row.description)),
        ),
      }));
    const matched = existingCandidates[0];
    return {
      name: module.name,
      proposedHours: round(module.totalHours),
      existingCandidates: existingCandidates.map((candidate) => ({
        id: candidate.id, name: candidate.name,
        estimatedHours: candidate.estimatedHours,
        taskCount: candidate.tasks.length,
      })),
      matchStatus: existingCandidates.length > 1 ? 'ambiguous' as const
        : existingCandidates.length === 1 ? 'possible_match' as const : 'no_match' as const,
      deltaVsExisting: existingCandidates.length === 1 && matched?.estimatedHours !== null &&
        matched?.estimatedHours !== undefined
        ? round(module.totalHours - matched.estimatedHours) : null,
      activities,
    };
  });

  const notes = [
    'Coincidencias por nombre normalizado: son candidatos de revisión humana, NO identificadores equivalentes ni instrucciones de actualización.',
    'Las HH por módulo provienen de la EDT fuente; las HH comerciales actuales se calculan aparte y pueden haberse editado.',
    'No se asignan fechas, usuarios ni tareas reales. El plan existente y Forecast permanecen intactos.',
  ];
  if (version.draft.analysisProjectionStatus === 'modified') {
    notes.push('La cotización fue editada: la EDT fuente no está conciliada con las HH comerciales.');
  }
  if (modules.some((row) => row.matchStatus === 'ambiguous')) {
    notes.push('Existen módulos homónimos en el proyecto: se necesita identificar manualmente el destino correcto.');
  }
  if (modules.some((row) => row.activities.some((activity) =>
    activity.possibleExistingTasks.length > 0))) {
    notes.push('Se detectaron nombres de tareas coincidentes; no crear tareas duplicadas sin revisión.');
  }
  return {
    source: version.draft.analysisProjectionStatus === 'modified' ? 'modified_analysis' : 'analysis',
    activityCount: analysis.activities.length,
    proposedModuleCount: modules.length,
    proposedHours: round(analysis.summary.baseHours),
    // Permite elegir por ID un módulo distinto al sugerido por nombre.
    // El usuario debe confirmar cada vínculo; no autoriza actualización alguna.
    availableExistingModules: existingModules,
    modules, notes,
  };
}
