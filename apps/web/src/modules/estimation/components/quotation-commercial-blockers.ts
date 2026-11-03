import type { QuotationVersion } from '@kora/contracts';

type Available = Pick<QuotationVersion,
  'hourlyRate' | 'totalHours' | 'netAmount' | 'totalAmount' | 'origin' |
  'aiReviewStatus' | 'draft' | 'status'>;

/** Requisitos concretos del envío/aprobación, sin ocultarlos en un title.
 * El backend sigue siendo la autoridad para autorizar cada transición.
 */
export function quotationCommercialBlockers(
  version: Available,
  { dirty, latest, canOperate, demoProduction }: {
    dirty: boolean; latest: boolean; canOperate: boolean; demoProduction?: boolean;
  },
): string[] {
  const result: string[] = [];
  if (!canOperate) result.push('No tienes permisos para realizar esta acción.');
  if (!latest) result.push('Selecciona la versión más reciente de la cotización.');
  if (dirty) result.push('Guarda los cambios del borrador.');
  if (version.hourlyRate === null || !Number.isFinite(version.hourlyRate) ||
      version.hourlyRate <= 0) result.push('Ingresa y guarda un valor HH mayor que cero.');
  if (version.totalHours <= 0 || version.draft.teams.length === 0) {
    result.push('Asigna equipos Kora y horas a la cotización.');
  }
  const percentage = version.draft.paymentPlan.reduce((sum, row) => sum + row.percent, 0);
  if (!version.draft.paymentPlan.length || Math.abs(percentage - 100) > 0.001) {
    result.push('Completa el plan de pago: ' +
      percentage.toLocaleString('es-CL', { maximumFractionDigits: 2 }) + '% de 100%.');
  }
  if (version.origin === 'ai' && version.aiReviewStatus !== 'accepted') {
    result.push('Acepta la propuesta IA en el bloque violeta de la parte superior.');
  }
  if (version.origin === 'ai' && version.draft.aiPoc?.edt &&
      version.draft.analysisProjectionStatus === 'modified') {
    result.push('Concilia la EDT con las HH comerciales ajustadas.');
  }
  if (version.netAmount === null || version.totalAmount === null) {
    result.push('Guarda la versión para calcular el monto neto y total.');
  }
  if (demoProduction && version.draft.aiPoc?.source === 'kdm_demo') {
    result.push('La documentación KDM de demostración no permite envío ni aprobación en producción.');
  }
  return result;
}
