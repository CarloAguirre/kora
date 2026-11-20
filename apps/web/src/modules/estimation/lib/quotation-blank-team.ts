import type { QuotationDraftData } from '@kora/contracts';

type Team = QuotationDraftData['teams'][number];

/** Equipo básico para la cotización manual; no existe hasta que se edita o incluye. */
export const emptyQuotationTeam = (teamId: string): Team => ({
  teamId, collaborators: 1, unit: 'week', duration: 1,
  hoursPerWeek: 40, dedicationPercent: 100,
});

/**
 * Edición atómica para borradores en blanco: crear el equipo al tocar cualquier
 * campo sin exigir previamente la casilla. Mantiene equipos existentes y no
 * agrega equipos desconocidos automáticamente a una EDT de Gemini.
 */
export function withQuotationTeamEdit(
  draft: QuotationDraftData, teamId: string, patch: Partial<Team>,
): QuotationDraftData {
  const existing = draft.teams.find((team) => team.teamId === teamId);
  if (!existing && draft.aiPoc?.edt) return draft;
  const updated = { ...(existing ?? emptyQuotationTeam(teamId)), ...patch, teamId };
  return {
    ...draft,
    teams: existing
      ? draft.teams.map((team) => team.teamId === teamId ? updated : team)
      : [...draft.teams, updated],
  };
}
