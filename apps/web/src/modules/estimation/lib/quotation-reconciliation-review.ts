import {
  quotationReconciliationReviewSchema,
  type QuotationReconciliationDecision,
  type QuotationReconciliationReview,
  type QuotationTransferPreview,
} from '@kora/contracts';

/**
 * Propuestas humanas LOCAL-only para acordar D04. Ni este modelo ni su
 * exportación confieren permisos de traspaso.
 */
export interface ReconciliationChoice {
  decision: QuotationReconciliationDecision;
  targetId: string | null;
  note: string;
}
export interface ReconciliationChoices {
  modules: Record<number, ReconciliationChoice>;
  /** WBS es único dentro de un artefacto de análisis validado. */
  activities: Record<string, ReconciliationChoice>;
}
export const emptyReconciliationChoices = (): ReconciliationChoices =>
  ({ modules: {}, activities: {} });
const pending: ReconciliationChoice = { decision: 'pending', targetId: null, note: '' };

/** Crea un documento de trabajo, no un payload para modificar la BD. */
export function buildReconciliationReview(
  preview: QuotationTransferPreview,
  choices: ReconciliationChoices,
  exportedAt: string,
): QuotationReconciliationReview {
  const edt = preview.edtReconciliation;
  const existingModules = edt.availableExistingModules ?? [];
  const issues: string[] = [];
  if (edt.source === 'no_analysis') {
    issues.push('NO_EDT: la versión no contiene actividades WBS para conciliar.');
  }
  if (edt.source === 'modified_analysis') {
    issues.push('EDT_DESACTUALIZADA: las HH comerciales no coinciden necesariamente con las originales.');
  }
  if (preview.operational.usedHours > 0) {
    issues.push('HORAS_HISTORICAS: proteger las HH consumidas; revisar D05.');
  }
  if (preview.operational.milestoneCounts.invoiced + preview.operational.milestoneCounts.paid > 0) {
    issues.push('HITOS_FACTURADOS: no sustituir facturas/hitos existentes; revisar D05.');
  }
  const usedTargets = new Map<string, number>();
  const usedTaskTargets = new Map<string, number>();
  const moduleDecisions = edt.modules.map((module, moduleIndex) => {
    const selected = choices.modules[moduleIndex] ?? pending;
    const targetModuleId = selected.decision === 'link_existing' ? selected.targetId : null;
    const matched = existingModules.find((item) => item.id === targetModuleId);

    if (selected.decision === 'link_existing') {
      if (!matched) throw new Error('El módulo EDT "' + module.name +
        '" debe apuntar a un módulo existente en la lectura actual del proyecto.');
      usedTargets.set(matched.id, (usedTargets.get(matched.id) ?? 0) + 1);
    } else if (selected.decision === 'pending') {
      issues.push('MODULO_PENDIENTE: ' + module.name);
    }
    if (selected.decision !== 'pending' && !selected.note.trim()) {
      issues.push('MODULO_SIN_FUNDAMENTO: ' + module.name);
    }

    const activityDecisions = module.activities.map((activity) => {
      const decision = choices.activities[activity.wbs] ?? pending;
      const targetTaskId = decision.decision === 'link_existing' ? decision.targetId : null;
      if (decision.decision === 'link_existing') {
        if (selected.decision !== 'link_existing' || !matched?.tasks.some((task) => task.id === targetTaskId)) {
          throw new Error('La actividad ' + activity.wbs +
            ' solo puede enlazarse con una tarea del módulo operativo elegido.');
        }
        if (targetTaskId) usedTaskTargets.set(targetTaskId, (usedTaskTargets.get(targetTaskId) ?? 0) + 1);
      } else if (decision.decision === 'pending') {
        issues.push('ACTIVIDAD_PENDIENTE: ' + activity.wbs);
      }
      if (selected.decision === 'do_not_transfer' &&
          decision.decision !== 'pending' && decision.decision !== 'do_not_transfer') {
        throw new Error('Un módulo marcado como no transferible no admite altas ni vínculos de tareas.');
      }
      return {
        wbs: activity.wbs,
        description: activity.description,
        edtHours: activity.proposedHours,
        decision: decision.decision,
        targetTaskId,
        note: decision.note,
      };
    });
    return {
      moduleIndex,
      edtName: module.name,
      edtHours: module.proposedHours,
      decision: selected.decision,
      targetModuleId,
      note: selected.note,
      activityDecisions,
    };
  });
  for (const [id, count] of usedTargets) {
    if (count > 1) issues.push(
      'DESTINO_COMPARTIDO: ' + id + ' está seleccionado por ' + count +
      ' módulos EDT. Requiere análisis de alcance; no fusionar automáticamente.',
    );
  }
  for (const [id, count] of usedTaskTargets) {
    if (count > 1) issues.push(
      'TAREA_COMPARTIDA: ' + id + ' está seleccionada por ' + count +
      ' actividades WBS. No duplicar HH ni sobrescribir histórico.',
    );
  }
  if (Math.abs(preview.proposed.totalHours - edt.proposedHours) > 0.011 &&
      edt.source !== 'no_analysis') {
    issues.push('HH_DIVERGENTES: HH comerciales distintas de la EDT original.');
  }
  // La revisión exportada nunca cambia el permiso final del endpoint GET.
  return quotationReconciliationReviewSchema.parse({
    schemaVersion: 'kora.quotation.reconciliation-review.v1',
    status: 'draft_for_discussion',
    transferEnabled: false,
    projectId: preview.projectId,
    versionId: preview.versionId,
    versionNumber: preview.versionNumber,
    versionRevision: preview.revision,
    previewCalculatedAt: preview.calculatedAt,
    exportedAt,
    snapshot: {
      projectStatus: preview.operational.status,
      salesStage: preview.operational.salesStage,
      soldHours: preview.operational.soldHours,
      usedHours: preview.operational.usedHours,
      quotationHours: preview.proposed.totalHours,
      edtHours: edt.proposedHours,
      milestoneCounts: preview.operational.milestoneCounts,
    },
    moduleDecisions,
    issues,
    pendingDecisionIds: preview.pendingDecisionIds,
  });
}
