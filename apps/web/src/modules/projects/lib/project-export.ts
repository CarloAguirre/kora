import * as XLSX from 'xlsx';
import type { ProjectSummary, SupportProjectUsage } from '@kora/contracts';
import {
  PROJECT_KIND_LABELS,
  PROJECT_PHASE_LABELS,
  PROJECT_PRIORITY_LABELS,
  PROJECT_STATUS_LABELS,
  SUPPORT_PLAN_TYPE_LABELS,
  projectKindOf,
} from '@kora/contracts';
import { getProjectStageLabel } from './project-stage-display';
import { formatProgressDelay, formatProgressPercent } from './project-progress-display';
import { supportHoursOf, type SupportHoursFigures } from './support-hours-display';

interface ExportColumn {
  readonly label: string;
  readonly getValue: (project: ProjectSummary) => string;
}

const formatDecimal = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
// Fechas `YYYY-MM-DD`: `T00:00:00` las lee en hora local (sin él, en Chile salían con un día menos).
const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '-');
const NOT_APPLICABLE = 'No aplica';

const DEVELOPMENT_COLUMNS: readonly ExportColumn[] = [
  { label: 'Prioridad', getValue: (p) => (p.priority ? PROJECT_PRIORITY_LABELS[p.priority] : '-') },
  { label: 'Nombre', getValue: (p) => p.name },
  { label: 'Cliente', getValue: (p) => p.client?.companyName ?? '-' },
  { label: 'Líder', getValue: (p) => p.leader?.fullName ?? '-' },
  // Igual que la tabla: Tipo, Estado y Etapa por separado, con los mismos valores que ofrecen sus
  // filtros. Antes iban fundidos en una sola columna (`getProjectStageLabel`) y un proyecto en
  // Levantamiento salía como "No iniciado"/"Cotizado"/etc., así que filtrar el Excel no cuadraba con la pantalla.
  { label: 'Tipo de proyecto', getValue: (p) => PROJECT_KIND_LABELS[projectKindOf(p)] },
  { label: 'Estado', getValue: (p) => PROJECT_STATUS_LABELS[p.status] },
  { label: 'Etapa', getValue: (p) => (p.phase ? PROJECT_PHASE_LABELS[p.phase] : '-') },
  { label: 'Inicio', getValue: (p) => formatDate(p.startDate) },
  { label: 'Fin', getValue: (p) => formatDate(p.endDate) },
  { label: '% Avance', getValue: (p) => formatProgressPercent(p.progress.actual) },
  { label: '% Esperado', getValue: (p) => formatProgressPercent(p.progress.expected) },
  { label: 'Retraso', getValue: (p) => formatProgressDelay(p.progress) },
  { label: 'HH vendidas', getValue: (p) => formatDecimal(p.soldHours) },
  { label: 'HH Consumidas', getValue: (p) => formatDecimal(p.usedHours) },
  { label: 'HH Restantes', getValue: (p) => formatDecimal(Math.max(p.soldHours - p.usedHours, 0)) },
  { label: 'HH desviadas', getValue: (p) => formatDecimal(Math.max(p.usedHours - p.soldHours, 0)) },
];

interface SupportExportColumn {
  readonly label: string;
  readonly getValue: (project: ProjectSummary, hours: SupportHoursFigures) => string;
}

const hoursOrNotApplicable = (hours: SupportHoursFigures, value: number | null) =>
  hours.notApplicable ? NOT_APPLICABLE : value === null ? '-' : formatDecimal(value);

// Mismas cifras que la tabla (ver `supportHoursOf`): en planes mensuales, el mes en curso.
const SUPPORT_COLUMNS: readonly SupportExportColumn[] = [
  { label: 'Nombre proyecto', getValue: (p) => p.name },
  { label: 'Cliente', getValue: (p) => p.client?.companyName ?? '-' },
  { label: 'Tipo de Soporte', getValue: (p) => (p.supportPlanType ? SUPPORT_PLAN_TYPE_LABELS[p.supportPlanType] : '-') },
  { label: 'Líder', getValue: (p) => p.leader?.fullName ?? '-' },
  { label: 'Etapa', getValue: (p) => getProjectStageLabel(p) },
  {
    label: 'HH Vendidas',
    getValue: (_p, h) => hoursOrNotApplicable(h, h.sold) + (h.soldUnit && h.sold !== null && !h.notApplicable ? ` ${h.soldUnit}` : ''),
  },
  { label: 'HH Acumuladas', getValue: (_p, h) => (h.notApplicable ? NOT_APPLICABLE : formatDecimal(h.priorSurplus)) },
  { label: 'HH Consumidas', getValue: (_p, h) => formatDecimal(h.used) },
  // Desglose informativo (solo mensual y bolsa), igual que debajo de las consumidas en la tabla.
  { label: 'HH Consumidas mes', getValue: (_p, h) => (h.usedBreakdown ? formatDecimal(h.usedBreakdown.month) : '-') },
  { label: 'HH Consumidas total contrato', getValue: (_p, h) => (h.usedBreakdown ? formatDecimal(h.usedBreakdown.total) : '-') },
  { label: 'HH Restantes', getValue: (_p, h) => hoursOrNotApplicable(h, h.remaining) },
  { label: 'HH desviadas', getValue: (_p, h) => hoursOrNotApplicable(h, h.deviation) },
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

export function exportSupportProjects(projects: readonly ProjectSummary[], usages: readonly SupportProjectUsage[]) {
  const usageByProject = new Map(usages.map((usage) => [usage.projectId, usage]));
  const columns: ExportColumn[] = SUPPORT_COLUMNS.map((column) => ({
    label: column.label,
    getValue: (p) => column.getValue(p, supportHoursOf(p, usageByProject.get(p.id))),
  }));
  exportToWorkbook(projects, columns, 'Soporte', 'proyectos-soporte');
}
