import * as XLSX from 'xlsx';
import type { ProjectSummary } from '@kora/contracts';
import { PROJECT_PRIORITY_LABELS } from '@kora/contracts';
import { getProjectStageLabel } from './project-stage-display';
import { formatProgressDelay, formatProgressPercent } from './project-progress-display';

interface ExportColumn {
  readonly label: string;
  readonly getValue: (project: ProjectSummary) => string;
}

const formatDecimal = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
// Fechas `YYYY-MM-DD`: `T00:00:00` las lee en hora local (sin él, en Chile salían con un día menos).
const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '-');

const DEVELOPMENT_COLUMNS: readonly ExportColumn[] = [
  { label: 'Prioridad', getValue: (p) => (p.priority ? PROJECT_PRIORITY_LABELS[p.priority] : '-') },
  { label: 'Nombre', getValue: (p) => p.name },
  { label: 'Cliente', getValue: (p) => p.client?.companyName ?? '-' },
  { label: 'Líder', getValue: (p) => p.leader?.fullName ?? '-' },
  { label: 'Estado', getValue: (p) => getProjectStageLabel(p) },
  { label: 'Inicio', getValue: (p) => formatDate(p.startDate) },
  { label: 'Fin', getValue: (p) => formatDate(p.endDate) },
  { label: '% Avance', getValue: (p) => formatProgressPercent(p.progress.actual) },
  { label: '% Esperado', getValue: (p) => formatProgressPercent(p.progress.expected) },
  { label: 'Retraso', getValue: (p) => formatProgressDelay(p.progress) },
  { label: 'HH vendidas', getValue: (p) => formatDecimal(p.soldHours) },
  { label: 'HH Consumidas', getValue: (p) => formatDecimal(p.usedHours) },
  { label: 'HH Restantes', getValue: (p) => formatDecimal(p.soldHours - p.usedHours) },
];

const SUPPORT_COLUMNS: readonly ExportColumn[] = [
  { label: 'Nombre proyecto', getValue: (p) => p.name },
  { label: 'Cliente', getValue: (p) => p.client?.companyName ?? '-' },
  { label: 'Tipo de Soporte', getValue: (p) => p.supportPlanDescription ?? '-' },
  { label: 'Líder', getValue: (p) => p.leader?.fullName ?? '-' },
  { label: 'Etapa', getValue: (p) => getProjectStageLabel(p) },
  { label: 'HH Vendidas', getValue: (p) => formatDecimal(p.supportHours) },
  { label: 'HH Consumidas', getValue: (p) => formatDecimal(p.usedHours) },
  { label: 'HH Restantes', getValue: (p) => formatDecimal(p.supportHours - p.usedHours) },
];

function exportToWorkbook(projects: readonly ProjectSummary[], columns: readonly ExportColumn[], sheetName: string, filePrefix: string) {
  const rows = [columns.map((c) => c.label), ...projects.map((p) => columns.map((c) => c.getValue(p)))];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export function exportDevelopmentProjects(projects: readonly ProjectSummary[]) {
  exportToWorkbook(projects, DEVELOPMENT_COLUMNS, 'Proyectos Desarrollo', 'proyectos-desarrollo');
}

export function exportSupportProjects(projects: readonly ProjectSummary[]) {
  exportToWorkbook(projects, SUPPORT_COLUMNS, 'Soporte', 'proyectos-soporte');
}
