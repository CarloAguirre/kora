import * as XLSX from 'xlsx';
import type { CapacityReportRow, HourEntrySummary, ProjectStatus } from '@kora/contracts';
import { HOUR_ENTRY_STATUS_LABELS, PROJECT_STATUS_LABELS } from '@kora/contracts';
import { resolvedApprover } from './approver';

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function formatMonth(periodDate: string): string {
  const [, month] = periodDate.split('-').map(Number);
  return MONTH_LABELS[(month ?? 1) - 1] ?? periodDate;
}

function formatPeriod(periodDate: string): string {
  const [year, month, day] = periodDate.split('-');
  return `${day}/${month}/${year}`;
}

const COLUMNS: ReadonlyArray<{ label: string; getValue: (row: CapacityReportRow) => string | number }> = [
  { label: 'Responsable', getValue: (r) => r.supervisorFullName },
  { label: 'Colaborador', getValue: (r) => r.collaboratorFullName },
  { label: 'Mes', getValue: (r) => formatMonth(r.periodDate) },
  { label: 'Periodo', getValue: (r) => formatPeriod(r.periodDate) },
  { label: 'Cliente', getValue: (r) => r.clientName },
  { label: 'Proyecto', getValue: (r) => r.projectName },
  { label: 'Tipo', getValue: (r) => r.type },
  { label: 'HH dedicadas', getValue: (r) => r.dedicatedHours },
  { label: 'Días dedicados', getValue: (r) => r.dedicatedDays },
  { label: '% dedicación', getValue: (r) => `${r.dedicationPercent}%` },
];

/** Exporta el reporte "Capacity" completo (no solo la página visible) — igual que `downloadCapacityXlsx` en la v1. */
export function exportCapacityReport(rows: readonly CapacityReportRow[], periodStart: string) {
  const sheetRows = [COLUMNS.map((c) => c.label), ...rows.map((row) => COLUMNS.map((c) => c.getValue(row)))];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Capacity');
  XLSX.writeFile(workbook, `capacity-${periodStart.slice(0, 7)}.xlsx`);
}

function formatEntryDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

// Mismo orden que la v1: Fecha, Autor, Equipo, Proyecto, Asignación,
// Actividad, Horas, Estado (etapa del proyecto), Comentario, Aprobado por,
// Estado de aprobación.
const HOUR_ENTRY_COLUMNS: ReadonlyArray<{ label: string; getValue: (row: HourEntrySummary) => string | number }> = [
  { label: 'Fecha', getValue: (r) => formatEntryDate(r.date) },
  { label: 'Autor', getValue: (r) => r.user.fullName },
  { label: 'Equipo', getValue: (r) => r.team?.name ?? '' },
  { label: 'Proyecto', getValue: (r) => r.project?.name ?? '' },
  { label: 'Asignación', getValue: (r) => r.assignment ?? '' },
  { label: 'Actividad', getValue: (r) => r.category },
  { label: 'Horas', getValue: (r) => r.hours },
  { label: 'Estado', getValue: (r) => (r.projectStageAtEntry ? PROJECT_STATUS_LABELS[r.projectStageAtEntry as ProjectStatus] : '') },
  { label: 'Comentario', getValue: (r) => r.description ?? '' },
  { label: 'Aprobado por', getValue: (r) => resolvedApprover(r)?.fullName ?? '' },
  { label: 'Estado de aprobación', getValue: (r) => HOUR_ENTRY_STATUS_LABELS[r.status] },
  { label: 'Motivo rechazo', getValue: (r) => r.rejectionReason ?? '' },
];

/** Exporta el historial de horas (respetando los filtros aplicados, no solo la página visible) — reemplaza al botón "Descargar registro de horas" de la v1. */
export function exportHourEntries(rows: readonly HourEntrySummary[]) {
  const sheetRows = [HOUR_ENTRY_COLUMNS.map((c) => c.label), ...rows.map((row) => HOUR_ENTRY_COLUMNS.map((c) => c.getValue(row)))];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Registro de horas');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `registro-horas-${today}.xlsx`);
}
