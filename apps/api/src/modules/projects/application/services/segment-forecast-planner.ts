const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface SegmentForecastPlanMember {
  readonly teamMemberId: string;
  /** Capacidad semanal del colaborador — la jornada diaria es `weeklyHours / 5`, igual que la capacidad del Forecast. */
  readonly weeklyHours: number;
  /** `null` ⇒ el colaborador está asignado al tramo pero no aporta HH al Forecast. */
  readonly dailyPercent: number | null;
}

/** Fila semanal (lunes a viernes) de Forecast que genera un tramo para un colaborador. */
export interface SegmentForecastWeek {
  readonly teamMemberId: string;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly assignedHours: number;
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
}): SegmentForecastWeek[] {
  const members = input.members.filter((m) => m.dailyPercent != null && m.dailyPercent > 0 && m.weeklyHours > 0);
  if (members.length === 0) return [];

  const start = startOfUtcDay(input.startDate);
  const end = startOfUtcDay(input.endDate);
  if (end < start) return [];

  const nonWorking = new Set(input.nonWorkingDates.map((d) => startOfUtcDay(d)));
  const workdaysByMonday = new Map<number, number>();

  for (let day = start; day <= end; day += MS_PER_DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday === 0 || weekday === 6 || nonWorking.has(day)) continue;
    const monday = day - (weekday - 1) * MS_PER_DAY;
    workdaysByMonday.set(monday, (workdaysByMonday.get(monday) ?? 0) + 1);
  }

  const weeks: SegmentForecastWeek[] = [];
  for (const [monday, workdays] of [...workdaysByMonday].sort(([a], [b]) => a - b)) {
    for (const member of members) {
      const assignedHours = round2(workdays * (member.weeklyHours / 5) * ((member.dailyPercent ?? 0) / 100));
      if (assignedHours <= 0) continue;
      weeks.push({
        teamMemberId: member.teamMemberId,
        periodStart: new Date(monday),
        periodEnd: new Date(monday + 4 * MS_PER_DAY),
        assignedHours,
      });
    }
  }
  return weeks;
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
