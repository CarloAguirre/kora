import { quotationDraftDataSchema, type EstimationAnalysisArtifact, type QuotationDraftData } from '@kora/contracts';

/**
 * Proyección de un artefacto IA completo al editor comercial. El WBS, la
 * trazabilidad y los requisitos se conservan en draft.analysis: NO se hace
 * reparto proporcional ni se incluyen horas de reserva técnica en la tarifa.
 *
 * Distintos perfiles pueden mapearse al mismo equipo real, sin perder la
 * división por perfil en el artefacto fuente.
 */
export function projectAnalysisToQuotationDraft(
  analysis: EstimationAnalysisArtifact,
  roleTeamIds: Record<string, string>,
): QuotationDraftData {
  const roles = analysis.roles.map((row) => row.role);
  if (roles.length === 0 || roles.some((role) => !roleTeamIds[role]) ||
    Object.keys(roleTeamIds).some((role) => !roles.includes(role))) {
    throw new Error('Todos los perfiles del EDT deben asociarse explícitamente con un equipo Kora.');
  }

  const uniqueTeamIds = [...new Set(roles.map((role) => roleTeamIds[role]!))];
  const duration = Math.ceil(analysis.summary.durationWorkingDays / 5);

  const phases = analysis.tranches.map((tranche) => {
    const sums = new Map<string, number>();
    for (const role of roles) {
      const teamId = roleTeamIds[role]!;
      const hours = tranche.hoursByRole[role] ?? 0;
      if (hours > 0) sums.set(teamId, (sums.get(teamId) ?? 0) + hours);
    }
    return {
      name: tranche.name,
      startWeek: tranche.startWeek,
      durationWeeks: tranche.durationWeeks,
      teamHours: [...sums].map(([teamId, hours]) => ({ teamId, hours })),
    };
  });

  const draft = quotationDraftDataSchema.parse({
    mode: 'phases',
    teams: uniqueTeamIds.map((teamId) => ({
      teamId, collaborators: 1, unit: 'week', duration,
      hoursPerWeek: 40, dedicationPercent: 100,
    })),
    phases, costs: [], paymentPlan: [],
    assumptions: analysis.assumptions.map((item) =>
      (item.key + ': ' + String(item.value ?? '') + '. ' + item.condition).slice(0, 2000)),
    exclusions: analysis.scope.excluded.slice(0, 100),
    sourceRefs: analysis.provenance.sourceFiles.map((source) =>
      [source.id, source.name, 'sha256:' + source.sha256].join(' | ')),
    answers: {},
    analysis: {
      ...analysis,
      roleTeamMappings: {
        ...analysis.roleTeamMappings,
        status: 'mapped_to_kora_teams',
        resolvedRoleTeamIds: { ...roleTeamIds },
      },
    },
    analysisProjectionStatus: 'synced',
  });

  const total = draft.phases.reduce((outer, phase) =>
    outer + phase.teamHours.reduce((sum, row) => sum + row.hours, 0), 0);
  if (Math.abs(total - analysis.summary.baseHours) > 0.011) {
    throw new Error('Proyección de equipos inconsistente con las HH base del EDT.');
  }
  return draft;
}
