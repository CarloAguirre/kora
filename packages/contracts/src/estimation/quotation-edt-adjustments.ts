import { quotationReferenceEdtSchema, type QuotationReferenceEdt } from './quotation-reference-edt.contract';
import type { QuotationDraftData } from './quotation.contract';

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Aplica cambios humanos únicamente sobre una copia del artefacto IA.
 * El documento original en draft.aiPoc.edt se conserva íntegro.
 * No se aceptan WBS/roles inventados ni ajustes que no puedan conciliarse.
 */
export function effectiveQuotationEdt(
  draft: Pick<QuotationDraftData, 'aiPoc' | 'edtHourAdjustments'>,
): QuotationReferenceEdt | null {
  const source = draft.aiPoc?.edt;
  const overrides = draft.edtHourAdjustments ?? [];
  if (!source) {
    if (overrides.length) throw new Error('No se pueden ajustar HH sin una EDT de origen.');
    return null;
  }
  const rows = new Map<string, number>();
  const all = new Set<string>();
  for (const module of source.modules) {
    for (const task of module.tasks) {
      const efforts = task.roleEffort ?? [{ role: task.role, hours: task.hours }];
      for (const effort of efforts) all.add(JSON.stringify([task.wbs, effort.role]));
    }
  }
  for (const change of overrides) {
    const key = JSON.stringify([change.wbs, change.role]);
    if (!all.has(key) || rows.has(key)) {
      throw new Error('HH ajustadas con WBS/perfil inexistente o duplicado: ' +
        change.wbs + ' / ' + change.role);
    }
    if (!Number.isFinite(change.hours) || change.hours <= 0 ||
        round(change.hours) !== change.hours) {
      throw new Error('Las HH ajustadas deben ser positivas y tener máximo dos decimales.');
    }
    rows.set(key, change.hours);
  }
  const copy = structuredClone(source);
  let total = 0;
  const byStage = new Map<string, number>();
  for (const module of copy.modules) {
    let moduleHours = 0;
    for (const task of module.tasks) {
      if (task.roleEffort?.length) {
        task.roleEffort = task.roleEffort.map((part) => ({
          ...part, hours: rows.get(JSON.stringify([task.wbs, part.role])) ?? part.hours,
        }));
        task.hours = round(task.roleEffort.reduce((sum, part) => sum + part.hours, 0));
        // Mantener el perfil principal original; sigue existiendo en roleEffort.
      } else {
        task.hours = rows.get(JSON.stringify([task.wbs, task.role])) ?? task.hours;
      }
      moduleHours = round(moduleHours + task.hours);
      if (task.stageCode) byStage.set(task.stageCode,
        round((byStage.get(task.stageCode) ?? 0) + task.hours));
    }
    module.totalHours = moduleHours;
    total = round(total + moduleHours);
  }
  copy.totalHours = total;
  if (copy.schemaVersion === 'kora.quotation.reference-edt.v2') {
    copy.stages = copy.stages?.map((stage) => ({
      ...stage, totalHours: byStage.get(stage.code) ?? 0,
    }));
    copy.reserveHours = round(total * (copy.reservePercent ?? 0) / 100);
    copy.totalWithReserve = round(total + copy.reserveHours);
  }
  return quotationReferenceEdtSchema.parse(copy);
}
