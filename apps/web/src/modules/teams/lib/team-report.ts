import type { ProjectStatus, TeamReportProject, TeamReportResponse } from '@kora/contracts';

/**
 * Cálculos del "Reporte de equipo" (`/equipos`, consola del líder). Portado del prototipo
 * `Kora — Reporte de equipo (Líder de equipo).html`: el estado de participación del área,
 * "Incurridas vs. Asignadas" y los avisos de datos faltantes se derivan solos de las HH
 * registradas, las asignaciones y el estado del proyecto — el líder solo agrega comentarios.
 */

export const PARTICIPATION_STATUSES = ['in_progress', 'on_hold', 'finished', 'client_ok', 'not_started'] as const;
export type ParticipationStatus = (typeof PARTICIPATION_STATUSES)[number];

export const PARTICIPATION_STATUS_LABELS: Record<ParticipationStatus, string> = {
  in_progress: 'En proceso',
  on_hold: 'Detenido',
  finished: 'Terminado',
  client_ok: 'Ok cliente',
  not_started: 'No iniciado',
};

const PROJECT_STATUS_WORD: Record<ProjectStatus, string> = {
  draft: 'no iniciado',
  active: 'activo',
  on_hold: 'detenido',
  finished: 'finalizado',
  cancelled: 'cancelado',
};

export interface ParticipationState {
  readonly status: ParticipationStatus;
  /** Por qué quedó en ese estado — tooltip del badge y tarjeta de detalle. */
  readonly reason: string;
}

/** Lo define, en este orden: el estado del proyecto en Kora y las tareas asignadas al equipo en ese proyecto. */
export function participationState(project: TeamReportProject, accumulated: number): ParticipationState {
  const { total, approved } = project.teamTasks;
  const progress = total > 0 ? `${approved} de ${total} tareas del equipo aprobadas` : '';

  if (project.status === 'on_hold') {
    return {
      status: 'on_hold',
      reason: `El proyecto está detenido en Kora${progress ? ` · ${progress}` : ''}.`,
    };
  }
  if (project.status === 'finished')
    return {
      status: 'finished',
      reason: 'El proyecto está finalizado en Kora.',
    };
  if (total > 0) {
    if (approved >= total)
      return {
        status: 'finished',
        reason: `Todas las tareas del equipo están aprobadas (${total} de ${total}).`,
      };
    if (project.teamDeliveryApproved)
      return {
        status: 'client_ok',
        reason: `El cliente aprobó la entrega del equipo · ${progress}.`,
      };
    if (approved > 0 || accumulated > 0) {
      return {
        status: 'in_progress',
        reason: `${progress} · proyecto ${PROJECT_STATUS_WORD[project.status]}.`,
      };
    }
    return {
      status: 'not_started',
      reason: 'Tareas del equipo asignadas, sin avance todavía.',
    };
  }
  if (accumulated > 0)
    return {
      status: 'in_progress',
      reason: 'El equipo registra HH, pero no tiene tareas cargadas en el proyecto.',
    };
  return {
    status: 'not_started',
    reason: `Proyecto ${PROJECT_STATUS_WORD[project.status]} y sin tareas del equipo asignadas.`,
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export interface TeamReportRow {
  readonly project: TeamReportProject;
  /** HH de cada persona en el período (incluye las pendientes si se pidió). */
  readonly hoursByUser: ReadonlyMap<string, number>;
  /** HH pendientes del período por persona — marca "incluye pendientes" en la celda. */
  readonly pendingByUser: ReadonlyMap<string, number>;
  readonly total: number;
  /** HH desde el inicio del proyecto hasta el fin del período. */
  readonly accumulated: number;
  readonly assigned: number;
  /** HH Asignadas − acumuladas. Negativo = el equipo consumió más de lo asignado. */
  readonly balance: number;
  readonly participation: ParticipationState;
  readonly missingAssigned: boolean;
  readonly missingDates: boolean;
}

export function buildReportRows(report: TeamReportResponse, includePending: boolean): TeamReportRow[] {
  return report.projects.map((project) => {
    const hoursByUser = new Map<string, number>();
    const pendingByUser = new Map<string, number>();
    let accumulated = 0;
    for (const entry of project.hours) {
      hoursByUser.set(entry.userId, round2(entry.periodApproved + (includePending ? entry.periodPending : 0)));
      if (includePending && entry.periodPending > 0) pendingByUser.set(entry.userId, entry.periodPending);
      accumulated += entry.accumulatedApproved + (includePending ? entry.accumulatedPending : 0);
    }
    accumulated = round2(accumulated);
    const total = round2([...hoursByUser.values()].reduce((sum, value) => sum + value, 0));
    const assigned = project.assignedHours ?? 0;
    return {
      project,
      hoursByUser,
      pendingByUser,
      total,
      accumulated,
      assigned,
      balance: round2(assigned - accumulated),
      participation: participationState(project, accumulated),
      missingAssigned: assigned === 0 && accumulated > 0,
      missingDates: !project.startDate || !project.endDate,
    };
  });
}

export interface TeamReportTotals {
  readonly assigned: number;
  readonly byUser: ReadonlyMap<string, number>;
  readonly total: number;
  readonly accumulated: number;
  readonly balance: number;
}

export function sumReportRows(rows: readonly TeamReportRow[]): TeamReportTotals {
  const byUser = new Map<string, number>();
  let assigned = 0;
  let accumulated = 0;
  for (const row of rows) {
    assigned += row.assigned;
    accumulated += row.accumulated;
    for (const [userId, hours] of row.hoursByUser) byUser.set(userId, round2((byUser.get(userId) ?? 0) + hours));
  }
  const total = round2([...byUser.values()].reduce((sum, value) => sum + value, 0));
  return {
    assigned: round2(assigned),
    byUser,
    total,
    accumulated: round2(accumulated),
    balance: round2(assigned - accumulated),
  };
}

/** HH pendientes de aprobación dentro del período, de todo el reporte. */
export function pendingHoursInPeriod(report: TeamReportResponse): number {
  return round2(report.projects.reduce((sum, project) => sum + project.hours.reduce((acc, entry) => acc + entry.periodPending, 0), 0));
}

export const PERIOD_PRESETS = ['accumulated', 'this_month', 'last_month', 'last_30_days', 'custom'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  accumulated: 'Acumulado (desde el inicio)',
  this_month: 'Este mes',
  last_month: 'Mes anterior',
  last_30_days: 'Últimos 30 días',
  custom: 'Personalizado',
};

const pad = (value: number) => String(value).padStart(2, '0');
const isoOf = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** Fecha local de hoy en ISO — `toISOString()` daría el día UTC, que en Chile ya es mañana desde las 20–21 h. */
export function todayIso(now = new Date()): string {
  return isoOf(now);
}

/** Rango [desde, hasta] de un preset. "Acumulado" parte el 1 de enero del año en curso, igual que el prototipo. */
export function periodRange(preset: Exclude<PeriodPreset, 'custom'>, today: string): { dateFrom: string; dateTo: string } {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  switch (preset) {
    case 'accumulated':
      return { dateFrom: `${year}-01-01`, dateTo: today };
    case 'this_month':
      return { dateFrom: `${year}-${pad(month)}-01`, dateTo: today };
    case 'last_month':
      return {
        dateFrom: isoOf(new Date(year, month - 2, 1)),
        dateTo: isoOf(new Date(year, month - 1, 0)),
      };
    case 'last_30_days':
      return {
        dateFrom: isoOf(new Date(year, month - 1, day - 29)),
        dateTo: today,
      };
  }
}

/** `1234.5` → `1.234,5`; `0` → `–`. */
export function formatReportHours(value: number): string {
  if (value === 0) return '–';
  return value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** `2026-04-09` → `9 abril`. */
export function formatDayMonth(iso: string): string {
  const [, month, day] = iso.split('-').map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1]}`;
}

/** `2026-10-16` → `16/10/2026`. */
export function formatDmy(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

export function personInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] : '';
  return `${first}${last}`.toUpperCase();
}
