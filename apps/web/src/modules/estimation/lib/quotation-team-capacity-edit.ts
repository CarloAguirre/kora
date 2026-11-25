import { quotationEdtAssignments, type QuotationDraftData } from '@kora/contracts';
import {
  buildQuotationRedistributionPreview,
  type QuotationRedistributionPreview,
} from './quotation-hour-redistribution-preview';
import { withQuotationTeamEdit } from './quotation-blank-team';

export type QuotationTeamCapacityField = 'hoursPerWeek' | 'dedicationPercent';
type Team = QuotationDraftData['teams'][number];
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Son dos vistas editables de la MISMA capacidad (no dos multiplicadores).
 * Kora parte de 40 HH = 100% y limita la planificación regular a esa jornada.
 */
export function linkedQuotationTeamCapacity(
  field: QuotationTeamCapacityField, value: number,
): Pick<Team, 'hoursPerWeek' | 'dedicationPercent'> {
  if (!Number.isFinite(value) || value < 0 ||
      (field === 'hoursPerWeek' ? value > 40 : value > 100)) {
    throw new Error('La jornada regular admite entre 0 y 40 HH/semana (0 a 100%).');
  }
  if (field === 'hoursPerWeek') {
    const hoursPerWeek = round2(value);
    return { hoursPerWeek, dedicationPercent: round2(hoursPerWeek / 40 * 100) };
  }
  const dedicationPercent = round2(value);
  return { dedicationPercent, hoursPerWeek: round2(40 * dedicationPercent / 100) };
}

/**
 * EDT IA: una edición de capacidad ajusta proporcionalmente las HH reales
 * actuales, no inventa HH hasta completar capacidad teórica del equipo.
 * Siempre se pide confirmación WBS×perfil, respetando tareas marcadas Fija.
 * Sin EDT, el modo manual calcula HH desde capacidad, sin duplicar dedicación.
 */
export function buildQuotationTeamCapacityEdit(
  draft: QuotationDraftData, teamId: string,
  field: QuotationTeamCapacityField, value: number,
): { draft: QuotationDraftData; preview: QuotationRedistributionPreview | null } {
  const linked = linkedQuotationTeamCapacity(field, value);
  const team = draft.teams.find((item) => item.teamId === teamId);
  if (!team && draft.aiPoc?.edt) {
    throw new Error('Asocia primero el equipo a las tareas de la EDT.');
  }
  const updated = withQuotationTeamEdit(draft, teamId, linked);
  if (!draft.aiPoc?.edt) {
    if (draft.mode !== 'phases' || !team) return { draft: updated, preview: null };
    const oldCapacity = team.hoursPerWeek;
    const oldHours = draft.phases.reduce((sum, phase) =>
      sum + (phase.teamHours.find((row) => row.teamId === teamId)?.hours ?? 0), 0);
    if (oldHours > 0 && oldCapacity <= 0) {
      throw new Error('No se pueden escalar HH existentes desde una jornada de 0 horas.');
    }
    const ratio = oldCapacity > 0 ? linked.hoursPerWeek / oldCapacity : 1;
    return { preview: null, draft: {
      ...updated,
      phases: draft.phases.map((phase) => ({
        ...phase,
        teamHours: phase.teamHours.map((row) => row.teamId === teamId
          ? { ...row, hours: round2(row.hours * ratio) } : row),
      })),
    } };
  }

  const markCustomized = (next: QuotationDraftData): QuotationDraftData => ({
    ...next,
    edtCapacityCustomizedTeamIds: [...new Set([
      ...(next.edtCapacityCustomizedTeamIds ?? []), teamId,
    ])],
    teams: next.teams.map((row) =>
      row.teamId === teamId ? { ...row, ...linked } : row),
  });
  const assignments = quotationEdtAssignments(draft).filter((row) => row.teamKey === teamId);
  if (!assignments.length) return { draft: markCustomized(updated), preview: null };
  const currentWeekly = team?.hoursPerWeek ?? 40;
  if (currentWeekly <= 0) throw new Error('No se pueden escalar tareas desde 0 HH/semana.');
  const currentHours = round2(assignments.reduce((sum, row) => sum + row.hours, 0));
  const targetHours = round2(currentHours * linked.hoursPerWeek / currentWeekly);
  if (targetHours > 1_000_000) throw new Error('El total supera el límite de HH permitido.');
  if (targetHours === currentHours) return { draft: markCustomized(updated), preview: null };
  const preview = buildQuotationRedistributionPreview(draft, {
    teamKey: teamId, targetHours,
  });
  return { draft, preview: {
    ...preview, nextDraft: markCustomized(preview.nextDraft),
    capacityChange: {
      beforeHoursPerWeek: currentWeekly,
      afterHoursPerWeek: linked.hoursPerWeek,
      beforeDedicationPercent: team?.dedicationPercent ?? 100,
      afterDedicationPercent: linked.dedicationPercent,
    },
  } };
}
