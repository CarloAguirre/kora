import type { QuotationDraftData } from '@kora/contracts';
import type { QuotationTeamWeeklyRow } from './quotation-team-weekly-plan';

/**
 * Jornada de planificación de Kora, no afirmación de jornada legal.
 * No se persiste en borradores históricos; cambiarla no modifica HH comerciales.
 */
export const KORA_QUOTATION_REFERENCE_WEEK_HOURS = 40;

type Team = QuotationDraftData['teams'][number];
export type QuotationTeamCapacity = {
  averagePerPerson: number | null;
  occupationPercent: number | null;
  capacityPerPerson: number;
  peakPerPerson: number | null;
  peakWeek: number | null;
  overloadedWeeks: number[];
  durationConflict: boolean;
  missingDuration: boolean;
  scheduleUnavailable: boolean;
  overAverageCapacity: boolean;
};

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const weeksOf = (team: Team) => team.unit === 'day' ? team.duration / 5 : team.duration;

/**
 * Esfuerzo estimado != disponibilidad planificada.
 *
 * EDT: HH son las tareas; carga media = HH / dotación / duración; el pico
 * se obtiene de semanas y tramos realmente planificados, con solapamientos.
 * Manual: HH comerciales = dotación × semanas × hh/sem × dedicación.
 * En ningún caso esta auditoría modifica el presupuesto ni asume una
 * asignación individual de actividades (distribución equitativa orientativa).
 */
export function quotationTeamCapacity(
  team: Team, totalHours: number, scheduled?: QuotationTeamWeeklyRow,
  hasEdt = false,
): QuotationTeamCapacity {
  const collaborators = Math.max(1, team.collaborators);
  const weeks = weeksOf(team);
  const averagePerPerson = hasEdt
    ? weeks > 0 ? round(totalHours / collaborators / weeks) : null
    : round(team.hoursPerWeek * team.dedicationPercent / 100);
  const occupationPercent = averagePerPerson === null ? null
    : round(averagePerPerson / KORA_QUOTATION_REFERENCE_WEEK_HOURS * 100);
  const capacityPerPerson = round(
    KORA_QUOTATION_REFERENCE_WEEK_HOURS * team.dedicationPercent / 100);
  const loads = [...(scheduled?.weeklyHours ?? new Map<number, number>())]
    .map(([week, hh]) => ({ week, perPerson: hh / collaborators }))
    .sort((a, b) => a.week - b.week);
  const highest = loads.reduce<{ week: number; perPerson: number } | null>(
    (max, item) => !max || item.perPerson > max.perPerson ? item : max, null);
  const overloadedWeeks = hasEdt
    ? loads.filter((entry) => entry.perPerson > capacityPerPerson + 0.005)
      .map((entry) => entry.week)
    : [];
  const durationConflict = Boolean(hasEdt && totalHours > 0 && scheduled &&
    (weeks <= 0 || scheduled.activeWeeks > weeks + 0.000001));
  const missingDuration = Boolean(hasEdt && totalHours > 0 && weeks <= 0);
  const scheduleUnavailable = Boolean(hasEdt && totalHours > 0 && !scheduled);
  return {
    averagePerPerson, occupationPercent, capacityPerPerson,
    peakPerPerson: highest ? round(highest.perPerson) : null,
    peakWeek: highest?.week ?? null,
    overloadedWeeks, durationConflict, missingDuration, scheduleUnavailable,
    overAverageCapacity: Boolean(hasEdt && totalHours > 0 &&
      (averagePerPerson === null || averagePerPerson > capacityPerPerson + 0.005)),
  };
}
