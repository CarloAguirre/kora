import type { ForecastAssignmentRawRow } from '../../domain/repositories/forecast-assignment.repository';

/** Horas de proyecto/soporte cargadas a mano en el Forecast: son planificación, no carga comprometida. */
export function isManualPlanning(row: ForecastAssignmentRawRow): boolean {
  return row.source === 'manual' && (row.type === 'project' || row.type === 'support');
}

/**
 * Lo que un tramo o una tarea carga a un proyecto sale de lo que el líder ya había planificado a mano
 * para ese mismo proyecto esa semana — no se suma aparte. Por persona, semana y proyecto, las HH
 * planificadas a mano bajan en lo que ya cubren los tramos y tareas; si estos las superan, solo cuenta
 * lo calculado. Las filas planificadas que quedan en 0 se omiten. Ver docs/DECISION-M6-FORECAST.md.
 */
export function coverPlannedHours(rows: readonly ForecastAssignmentRawRow[]): ForecastAssignmentRawRow[] {
  const keyOf = (row: ForecastAssignmentRawRow) => `${row.teamMemberId}|${row.periodStart.getTime()}|${row.projectId}`;
  const coveredByKey = new Map<string, number>();
  for (const row of rows) {
    if (row.source === 'manual' || !row.projectId) continue;
    coveredByKey.set(keyOf(row), (coveredByKey.get(keyOf(row)) ?? 0) + row.assignedHours);
  }

  const result: ForecastAssignmentRawRow[] = [];
  for (const row of rows) {
    const covered = row.projectId && isManualPlanning(row) ? (coveredByKey.get(keyOf(row)) ?? 0) : 0;
    if (covered <= 0) {
      result.push(row);
      continue;
    }
    const taken = Math.min(covered, row.assignedHours);
    coveredByKey.set(keyOf(row), covered - taken);
    if (row.assignedHours - taken > 0) result.push({ ...row, assignedHours: row.assignedHours - taken });
  }
  return result;
}
