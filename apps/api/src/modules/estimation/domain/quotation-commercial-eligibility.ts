import type { QuotationVersion } from '@kora/contracts';

export class InvalidCommercialQuotation extends Error {
  constructor(message: string) { super(message); this.name = 'InvalidCommercialQuotation'; }
}

/** Solo condiciones comercialmente verificables, sin confundir status del
 * proyecto con aprobación del cliente. No muta la cotización ni el roadmap. */
export function assertQuotationReadyForClient(
  version: Pick<QuotationVersion, 'hourlyRate' | 'totalHours' | 'netAmount' |
    'totalAmount' | 'origin' | 'aiReviewStatus' | 'draft'>,
): void {
  if (version.hourlyRate === null || !Number.isFinite(version.hourlyRate) ||
      version.hourlyRate <= 0 || version.netAmount === null || version.totalAmount === null) {
    throw new InvalidCommercialQuotation('Primero ingresa un valor HH válido y guarda el borrador.');
  }
  if (version.totalHours <= 0 || version.draft.teams.length === 0) {
    throw new InvalidCommercialQuotation('Debes asignar equipos y HH a la cotización.');
  }
  const percents = version.draft.paymentPlan.map((row) => row.percent);
  const percentTotal = percents.reduce((sum, value) => sum + value, 0);
  if (percents.length === 0 || Math.abs(percentTotal - 100) > 0.001) {
    throw new InvalidCommercialQuotation('El plan de pagos debe sumar exactamente 100 %.');
  }
  if (version.origin === 'ai' && (version.aiReviewStatus !== 'accepted' ||
      version.draft.analysisProjectionStatus === 'modified')) {
    throw new InvalidCommercialQuotation(
      'Primero revisa y acepta la propuesta IA vigente después de editar sus HH.',
    );
  }
}

/** La IA puede aceptarse sin aprobación contractual y sin traspasar equipos.
 * Verifica que se haya proyectado y conciliado su presupuesto. */
export function assertAiProposalReadyToAccept(
  version: Pick<QuotationVersion, 'origin' | 'aiReviewStatus' | 'draft' | 'totalHours'>,
): void {
  if (version.origin !== 'ai' || version.aiReviewStatus !== 'pending') {
    throw new InvalidCommercialQuotation('Solo se puede aceptar una propuesta IA pendiente.');
  }
  const { aiPoc, analysisProjectionStatus, teams } = version.draft;
  if (!aiPoc || !aiPoc.edt ||
      analysisProjectionStatus !== 'synced' || teams.length === 0) {
    throw new InvalidCommercialQuotation('Primero revisa y asigna todos los perfiles IA a los equipos de Kora.');
  }
  const names = aiPoc.proposal.roles.map((r) => r.role);
  if (!names.length || names.some((name) => !aiPoc.roleTeamIds[name]) ||
      Object.keys(aiPoc.roleTeamIds).length !== names.length ||
      Math.abs(aiPoc.edt.totalHours - version.totalHours) > 0.011) {
    throw new InvalidCommercialQuotation('La distribución de HH o perfiles no coincide con el análisis IA.');
  }
}
