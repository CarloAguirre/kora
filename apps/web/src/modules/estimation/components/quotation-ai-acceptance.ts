import { effectiveQuotationEdt, type QuotationVersion } from '@kora/contracts';

/** Requisitos visibles del mismo flujo que valida el backend al aceptar IA.
 * No se puede aceptar una propuesta con HH sin guardar ni perfiles sin equipo. */
export function quotationAiAcceptanceBlockReason(
  version: QuotationVersion,
  { editable, dirty, isLatest }: { editable: boolean; dirty: boolean; isLatest: boolean },
): string | null {
  if (!editable || version.status !== 'draft') {
    return 'Esta versión no está disponible para edición.';
  }
  if (version.origin !== 'ai' || version.aiReviewStatus !== 'pending') {
    return 'Esta versión no tiene una propuesta IA pendiente.';
  }
  if (!isLatest) return 'Solo se puede aceptar la versión más reciente.';
  const aiPoc = version.draft.aiPoc;
  if (!aiPoc?.edt) return 'Falta la EDT original de la propuesta IA.';
  const missing = aiPoc.proposal.roles.filter((role) => {
    const teamId = aiPoc.roleTeamIds[role.role];
    return !teamId || !version.draft.teams.some((team) => team.teamId === teamId);
  });
  const requirements: string[] = [];
  if (dirty) requirements.push('guarda los cambios del borrador');
  if (!aiPoc.proposal.roles.length || missing.length) {
    requirements.push('asigna todos los perfiles de Gemini a equipos de Kora');
  }
  if (Object.keys(aiPoc.roleTeamIds).length !== aiPoc.proposal.roles.length &&
      missing.length === 0) {
    requirements.push('corrige el mapeo de perfiles IA sobrantes');
  }
  if (!dirty && missing.length === 0 &&
      version.draft.analysisProjectionStatus !== 'modified' &&
      Math.abs((effectiveQuotationEdt(version.draft)?.totalHours ?? 0) -
        version.totalHours) > 0.011) {
    requirements.push('concilia las HH comerciales con la EDT guardada');
  }
  return requirements.length ? 'Para aceptar: ' + requirements.join(' y ') + '.' : null;
}
