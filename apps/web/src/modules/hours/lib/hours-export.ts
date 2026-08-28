import * as XLSX from 'xlsx';
import type { CapacityReportRow } from '@kora/contracts';

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
