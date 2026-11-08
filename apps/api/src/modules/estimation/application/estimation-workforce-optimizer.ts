/**
 * Dimensionamiento determinístico posterior a Gemini.
 *
 * La EDT establece HH y ventanas temporales; este motor calcula la menor
 * dotación simultánea compatible con esas ventanas, a 40 HH por persona y
 * semana. Las semanas se calculan en centésimos para conservar todo el esfuerzo.
 * NO inventa HH, adelanta dependencias ni aumenta/reduce calendarios de Gemini.
 *
 * No confundir "dotación de pico" (personas concurrentes máximas) con la
 * asignación constante de esas personas a todas las semanas del proyecto:
 * los equipos pueden tener carga variable por semana y el resto no está
 * comprometido con este proyecto.
 */
import { WEEKLY_HOURS_PER_PERSON, isTechLeadRole } from './estimation-methodology';

export type WorkforceStage = {
  code: string;
  startWeek: number;
  durationWeeks: number;
};
export type WorkforceEffort = {
  stageCode: string;
  role: string;
  hours: number;
};
export type WorkforceRoleInput = {
  role: string;
  teamId?: string;
};

export type WorkforceLoad = {
  role: string;
  totalHours: number;
  activeWeeks: number;
  firstWeek: number;
  lastWeek: number;
  peakWeeklyHours: number;
  /** Dotación mínima simultánea (no personas para toda la duración). */
  people: number;
  /** Tiempo de ocupación en FTE-semanas a jornada completa, sin redondear HH. */
  fullTimeEquivalentWeeks: number;
  weeklyHours: ReadonlyMap<number, number>;
};

export type OptimizedWorkforce = {
  roles: readonly WorkforceLoad[];
  teams: readonly (Omit<WorkforceLoad, 'role'> & { teamId: string })[];
  horizonWeeks: number;
  totalHours: number;
};

const cents = (n: number) => Math.round(n * 100);
const round = (n: number) => Math.round(n * 100) / 100;

function summarize(
  role: string,
  perWeekCents: ReadonlyMap<number, number>,
): WorkforceLoad {
  const ordered = [...perWeekCents].filter(([, v]) => v > 0)
    .sort(([a], [b]) => a - b);
  const peakCents = Math.max(0, ...ordered.map(([, v]) => v));
  const totalCents = ordered.reduce((sum, [, value]) => sum + value, 0);
  const minimumPeople = peakCents > 0
    ? Math.ceil(peakCents / (WEEKLY_HOURS_PER_PERSON * 100)) : 0;
  if (minimumPeople > 100) {
    throw new Error('La carga de ' + role +
      ' requiere más de 100 personas simultáneas para el calendario propuesto.');
  }
  return {
    role,
    totalHours: totalCents / 100,
    activeWeeks: ordered.length,
    firstWeek: ordered[0]?.[0] ?? 0,
    lastWeek: ordered[ordered.length - 1]?.[0] ?? 0,
    peakWeeklyHours: peakCents / 100,
    people: minimumPeople,
    fullTimeEquivalentWeeks: minimumPeople
      ? round(totalCents / (WEEKLY_HOURS_PER_PERSON * 100)) : 0,
    weeklyHours: new Map(ordered.map(([week, amount]) => [week, amount / 100])),
  };
}

export function optimizeWorkforceForEdt(
  stages: readonly WorkforceStage[],
  efforts: readonly WorkforceEffort[],
  roles: readonly WorkforceRoleInput[],
): OptimizedWorkforce {
  const stageByCode = new Map(stages.map((stage) => [stage.code, stage]));
  if (stageByCode.size !== stages.length || stages.some((stage) =>
    !Number.isInteger(stage.startWeek) || stage.startWeek < 1 ||
    !Number.isInteger(stage.durationWeeks) || stage.durationWeeks < 1 ||
    stage.startWeek + stage.durationWeeks - 1 > 520)) {
    throw new Error('La EDT tiene un calendario de etapas inválido para dimensionar.');
  }
  const allowedRoles = new Map(roles.map((role) => [role.role, role]));
  if (allowedRoles.size !== roles.length) {
    throw new Error('La propuesta contiene perfiles duplicados.');
  }
  const grouped = new Map<string, number>();
  for (const effort of efforts) {
    const stage = stageByCode.get(effort.stageCode);
    if (!stage || !allowedRoles.has(effort.role) ||
      !Number.isFinite(effort.hours) || effort.hours <= 0 ||
      cents(effort.hours) / 100 !== effort.hours) {
      throw new Error('La EDT contiene HH sin etapa, perfil válido o precisión correcta.');
    }
    const key = JSON.stringify([effort.stageCode, effort.role]);
    grouped.set(key, (grouped.get(key) ?? 0) + cents(effort.hours));
  }
  const weeklyByRole = new Map<string, Map<number, number>>(
    roles.map((role) => [role.role, new Map<number, number>()]),
  );
  for (const [encoded, amount] of grouped) {
    const [stageCode, role] = JSON.parse(encoded) as [string, string];
    const stage = stageByCode.get(stageCode)!;
    const weeks = weeklyByRole.get(role)!;
    const base = Math.floor(amount / stage.durationWeeks);
    const remainder = amount % stage.durationWeeks;
    for (let i = 0; i < stage.durationWeeks; i++) {
      const week = stage.startWeek + i;
      const allocation = base + (i < remainder ? 1 : 0);
      weeks.set(week, (weeks.get(week) ?? 0) + allocation);
    }
  }
  const sizedRoles = roles.map((role) =>
    summarize(role.role, weeklyByRole.get(role.role)!));
  for (const role of sizedRoles) {
    if (!role.totalHours) {
      throw new Error('El perfil ' + role.role + ' no tiene HH en la EDT.');
    }
    // La supervisión TL es 5 HH/semana de una persona; no transformar
    // silenciosamente un Líder Técnico en varios ni mover horas a desarrollo.
    if (isTechLeadRole(role.role) && role.people > 1) {
      throw new Error('El Líder Técnico excede 40 HH/semana con una persona; ' +
        'revisar arquitectura hands-on, alcance o calendario sin duplicar supervisión.');
    }
  }
  const weeklyByTeam = new Map<string, Map<number, number>>();
  for (const role of sizedRoles) {
    const teamId = allowedRoles.get(role.role)!.teamId;
    if (!teamId) continue;
    const weeks = weeklyByTeam.get(teamId) ?? new Map<number, number>();
    for (const [week, amount] of weeklyByRole.get(role.role)!) {
      weeks.set(week, (weeks.get(week) ?? 0) + amount);
    }
    weeklyByTeam.set(teamId, weeks);
  }
  const sizedTeams = [...weeklyByTeam].map(([teamId, weeks]) => {
    const { role: _role, ...load } = summarize(teamId, weeks);
    return { teamId, ...load };
  });
  return {
    roles: sizedRoles,
    teams: sizedTeams,
    totalHours: round(sizedRoles.reduce((sum, item) => sum + item.totalHours, 0)),
    horizonWeeks: Math.max(1, ...stages.map((stage) =>
      stage.startWeek + stage.durationWeeks - 1)),
  };
}
