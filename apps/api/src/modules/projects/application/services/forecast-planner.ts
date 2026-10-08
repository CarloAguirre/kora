const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Fila semanal (lunes a viernes) de Forecast que calcula un tramo o una tarea para un colaborador. */
export interface PlannedForecastWeek {
  readonly teamMemberId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly assignedHours: number;
}

export interface SegmentForecastPlanMember {
  readonly teamMemberId: string;
  /** Capacidad semanal del colaborador — la jornada diaria es `weeklyHours / 5`, igual que la capacidad del Forecast. */
  readonly weeklyHours: number;
  /** `null` ⇒ el colaborador está asignado al tramo pero no aporta HH al Forecast. */
  readonly dailyPercent: number | null;
}

/** Rango de días (inclusive) — p. ej. un tramo que ya cubre a la persona. */
export interface DateRange {
  readonly start: Date;
  readonly end: Date;
}

/**
 * HH semanales que un tramo de ejecución le reserva a cada colaborador en el Forecast:
 * `días hábiles del tramo en esa semana × (weeklyHours / 5) × dailyPercent / 100`.
 *
 * Las semanas que el tramo cubre a medias se prorratean por los días que sí cubre, y los feriados
 * (`nonWorkingDates`) no cuentan — mismo criterio que la capacidad en `ForecastCapacityService`.
 * Las semanas que quedan en 0 HH no generan fila.
 */
export function planSegmentForecast(input: {
  readonly startDate: Date;
  readonly endDate: Date;
  readonly members: readonly SegmentForecastPlanMember[];
  readonly nonWorkingDates: readonly Date[];
}): PlannedForecastWeek[] {
  const members = input.members.filter((m) => m.dailyPercent != null && m.dailyPercent > 0 && m.weeklyHours > 0);
  if (members.length === 0) return [];

  const workdaysByMonday = new Map<number, number>();
  for (const day of workdays(input.startDate, input.endDate, input.nonWorkingDates)) {
    const monday = mondayOf(day);
    workdaysByMonday.set(monday, (workdaysByMonday.get(monday) ?? 0) + 1);
  }

  const weeks: PlannedForecastWeek[] = [];
  for (const [monday, count] of [...workdaysByMonday].sort(([a], [b]) => a - b)) {
    for (const member of members) {
      const assignedHours = round2(count * (member.weeklyHours / 5) * ((member.dailyPercent ?? 0) / 100));
      if (assignedHours <= 0) continue;
      weeks.push(toWeek(member.teamMemberId, monday, assignedHours));
    }
  }
  return weeks;
}

/**
 * HH semanales de una tarea para su responsable: las HH estimadas se reparten en partes iguales entre
 * los días hábiles de inicio a fecha límite (sin fines de semana ni feriados), y cada semana suma los
 * días que le tocan.
 *
 * - Los días que la persona ya tiene cubiertos por un tramo del mismo módulo (`coveredRanges`) no
 *   suman: esas horas ya están en el tramo y no se cuentan dos veces.
 * - Si la tarea se terminó (`completedAt`), las semanas que empiezan después quedan libres.
 * - Una tarea sin días hábiles (p. ej. solo un sábado) lleva todas sus HH a la semana de su fecha límite.
 */
export function planTaskForecast(input: {
  readonly teamMemberId: string;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly estimatedHours: number;
  readonly nonWorkingDates: readonly Date[];
  readonly coveredRanges: readonly DateRange[];
  readonly completedAt: Date | null;
}): PlannedForecastWeek[] {
  if (input.estimatedHours <= 0) return [];
  const start = startOfUtcDay(input.startDate);
  const end = startOfUtcDay(input.endDate);
  if (end < start) return [];

  const days = workdays(input.startDate, input.endDate, input.nonWorkingDates);
  const perDay = days.length > 0 ? input.estimatedHours / days.length : input.estimatedHours;
  const countedDays = days.length > 0 ? days : [end];

  const covered = input.coveredRanges.map((range) => ({ start: startOfUtcDay(range.start), end: startOfUtcDay(range.end) }));
  const lastMonday = input.completedAt ? mondayOf(startOfUtcDay(input.completedAt)) : Number.POSITIVE_INFINITY;

  const hoursByMonday = new Map<number, number>();
  for (const day of countedDays) {
    if (covered.some((range) => day >= range.start && day <= range.end)) continue;
    const monday = mondayOf(day);
    if (monday > lastMonday) continue;
    hoursByMonday.set(monday, (hoursByMonday.get(monday) ?? 0) + perDay);
  }

  return [...hoursByMonday]
    .sort(([a], [b]) => a - b)
    .map(([monday, hours]) => toWeek(input.teamMemberId, monday, round2(hours)))
    .filter((week) => week.assignedHours > 0);
}

/** Días hábiles (lun–vie, sin feriados) entre `start` y `end`, inclusive, como milisegundos UTC a medianoche. */
function workdays(startDate: Date, endDate: Date, nonWorkingDates: readonly Date[]): number[] {
  const start = startOfUtcDay(startDate);
  const end = startOfUtcDay(endDate);
  const nonWorking = new Set(nonWorkingDates.map((d) => startOfUtcDay(d)));
  const days: number[] = [];
  for (let day = start; day <= end; day += MS_PER_DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6 || nonWorking.has(day)) continue;
    days.push(day);
  }
  return days;
}

function mondayOf(day: number): number {
  const weekday = new Date(day).getUTCDay();
  return day - ((weekday + 6) % 7) * MS_PER_DAY;
}

function toWeek(teamMemberId: string, monday: number, assignedHours: number): PlannedForecastWeek {
  return { teamMemberId, periodStart: new Date(monday), periodEnd: new Date(monday + 4 * MS_PER_DAY), assignedHours };
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
