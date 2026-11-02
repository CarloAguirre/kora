import type { EstimationPocRole, QuotationReferenceEdt } from '@kora/contracts';

/**
 * Desglose diario puramente referencial de una EDT v2.
 *
 * Día hábil relativo (lunes-viernes, cinco por semana), NO fechas reales,
 * NO responsables, NO registros en project_module_tasks / Forecast.
 * Las HH proceden exclusivamente del EDT de Gemini; Kora solo las ubica
 * de manera determinística dentro de los tramos y verifica capacidad.
 */
export interface ReferenceDailyPlanRow {
  day: number;
  week: number;
  stageCode: string;
  stageName: string;
  role: string;
  wbs: string;
  activity: string;
  module: string;
  hours: number;
}

export interface ReferenceDailyPlan {
  rows: ReferenceDailyPlanRow[];
  sourceHours: number;
  plannedHours: number;
  pendingHours: number;
  dayCount: number;
  stageCount: number;
  issues: string[];
}

const cents = (hours: number) => Math.round((hours + Number.EPSILON) * 100);
const hours = (amount: number) => amount / 100;

/**
 * Capacidad referencial: horas por unidad/persona de la propuesta,
 * nunca más de 8 HH por persona/día. Dos personas permiten hasta
 * 16 HH/día de un mismo perfil, sin asignar nombres.
 */
function dailyCapacity(role: EstimationPocRole): number {
  if (!Number.isFinite(role.people) || !Number.isFinite(role.hoursPerUnit) ||
      role.people <= 0 || role.hoursPerUnit <= 0) return 0;
  const perPerson = role.unit === 'week' ? role.hoursPerUnit / 5 : role.hoursPerUnit;
  return Math.max(0, cents(Math.min(8, perPerson) * role.people));
}

export function buildReferenceDailyPlan(
  edt: QuotationReferenceEdt,
  roles: readonly EstimationPocRole[],
): ReferenceDailyPlan | null {
  if (edt.schemaVersion !== 'kora.quotation.reference-edt.v2') return null;

  const stages = [...(edt.stages ?? [])].sort((a, b) =>
    a.startWeek - b.startWeek || a.code.localeCompare(b.code));
  const byStage = new Map(stages.map((stage) => [stage.code, stage]));
  const byRole = new Map(roles.map((role) => [role.role, role]));
  const consumption = new Map<string, Map<number, number>>();
  const rows: ReferenceDailyPlanRow[] = [];
  const issues: string[] = [];
  let pending = 0;

  // Al recorrer primero los tramos que comienzan antes, el calendario
  // respeta su orden relativo incluso cuando comparten días.
  const activities = edt.modules.flatMap((module) =>
    module.tasks.map((task) => ({ module: module.name, task })));
  activities.sort((a, b) => {
    const first = byStage.get(a.task.stageCode ?? '')?.startWeek ?? Infinity;
    const second = byStage.get(b.task.stageCode ?? '')?.startWeek ?? Infinity;
    return first - second ||
      (a.task.stageCode ?? '').localeCompare(b.task.stageCode ?? '') ||
      a.task.wbs.localeCompare(b.task.wbs);
  });

  for (const { module, task } of activities) {
    const stage = byStage.get(task.stageCode ?? '');
    const efforts = task.roleEffort ?? [{ role: task.role, hours: task.hours }];
    for (const part of efforts) {
      let remaining = cents(part.hours);
      const role = byRole.get(part.role);
      const capacity = role ? dailyCapacity(role) : 0;
      if (!stage || capacity === 0) {
        pending += remaining;
        issues.push(`${task.wbs} · ${part.role}: ${!stage
          ? 'tramo inexistente' : 'sin capacidad disponible en la propuesta'}; ${hours(remaining)} HH pendientes.`);
        continue;
      }

      const used = consumption.get(part.role) ?? new Map<number, number>();
      consumption.set(part.role, used);
      const firstDay = (stage.startWeek - 1) * 5 + 1;
      const lastDay = (stage.startWeek + stage.durationWeeks - 1) * 5;
      for (let day = firstDay; day <= lastDay && remaining > 0; day++) {
        const available = Math.max(0, capacity - (used.get(day) ?? 0));
        const allocation = Math.min(available, remaining);
        if (!allocation) continue;
        used.set(day, (used.get(day) ?? 0) + allocation);
        rows.push({
          day, week: Math.ceil(day / 5),
          stageCode: stage.code, stageName: stage.name,
          role: part.role, wbs: task.wbs, activity: task.name, module,
          hours: hours(allocation),
        });
        remaining -= allocation;
      }
      if (remaining > 0) {
        pending += remaining;
        issues.push(
          `${task.wbs} · ${part.role}: faltan ${hours(remaining)} HH; ` +
          `el tramo ${stage.code} (semanas ${stage.startWeek}–` +
          `${stage.startWeek + stage.durationWeeks - 1}) no admite más carga.`,
        );
      }
    }
  }

  rows.sort((a, b) => a.day - b.day ||
    a.stageCode.localeCompare(b.stageCode) ||
    a.role.localeCompare(b.role) || a.wbs.localeCompare(b.wbs));

  const planned = rows.reduce((sum, row) => sum + cents(row.hours), 0);
  const expected = cents(edt.totalHours);
  // Las inconsistencias deben mostrarse, nunca corregirse alterando HH.
  if (planned + pending !== expected) {
    issues.push(
      `Las asignaciones (${hours(planned + pending)} HH) difieren de la EDT ` +
      `(${hours(expected)} HH). Revisar la versión antes de utilizarla.`,
    );
  }
  return {
    rows,
    sourceHours: hours(expected),
    plannedHours: hours(planned),
    pendingHours: hours(pending),
    dayCount: rows.length ? rows[rows.length - 1]!.day : 0,
    stageCount: stages.length,
    issues,
  };
}

const cell = (value: string | number) =>
  '"' + String(value).replace(/"/g, '""') + '"';

/** Estructura compatible con las 10 columnas de Plan_Diario del EDT Zurich.
 * La columna Fecha permanece intencionalmente vacía.
 */
export function referenceDailyPlanCsv(
  plan: ReferenceDailyPlan,
  teamName?: (role: string) => string,
): string {
  const header = [
    'Día hábil relativo', 'Fecha', 'Tramo', 'Equipo / perfil', 'Actividad ID',
    'Actividad cronológica', 'HH', 'Estado', 'Módulo', 'Comentario',
  ];
  const entries = plan.rows.map((row) => [
    row.day, '', row.stageCode, teamName?.(row.role) ?? row.role, row.wbs,
    row.activity, row.hours.toFixed(2).replace('.', ','), 'Referencial',
    row.module, `Semana ${row.week}; sin fecha ni responsable`,
  ]);
  return '\ufeff' + [header, ...entries]
    .map((entry) => entry.map(cell).join(';'))
    .join('\r\n');
}
