import * as XLSX from 'xlsx';
import type { DashboardSupportSummary } from '@kora/contracts';

const formatDecimal = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

/**
 * Reemplaza el reporte PDF de la v1 (`downloadDashboardPDF`) — v2 no tiene
 * generación de PDF en ningún otro lugar (ver investigación M7), así que se
 * reutiliza el mismo patrón xlsx que ya exporta Proyectos
 * (`project-export.ts`) en vez de sumar una dependencia nueva solo para este
 * botón.
 */
export function exportSupportReport(summary: DashboardSupportSummary) {
  const summaryRows = [
    ['Reporte de Soporte'],
    [],
    ['Proyectos con soporte', summary.projectsWithSupportCount],
    ['Total Horas Vendidas', formatDecimal(summary.soldHours)],
    ['Total Horas Utilizadas', formatDecimal(summary.usedHours)],
    ['% Utilizadas', `${summary.usedPercent}%`],
    ['Horas Desviadas', formatDecimal(summary.deviationHours)],
    ['% Desviadas', `${summary.deviationPercent}%`],
    ['Horas Extra del Mes (aprobadas)', formatDecimal(summary.overtime.approvedHours)],
    ['Horas Extra del Mes (pendientes)', formatDecimal(summary.overtime.pendingHours)],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);

  const clientRows = [
    ['Cliente', 'HH Utilizadas', 'HH Vendidas', '% Utilización'],
    ...summary.topClients.map((c) => [c.name, formatDecimal(c.usedHours), formatDecimal(c.soldHours), `${c.percent}%`]),
  ];
  const clientSheet = XLSX.utils.aoa_to_sheet(clientRows);

  const overtimeRows = [
    ['Colaborador', 'HH Extra Aprobadas', 'HH Extra Pendientes', 'Total'],
    ...summary.overtime.byUser.map((u) => [
      u.fullName,
      formatDecimal(u.approvedHours),
      formatDecimal(u.pendingHours),
      formatDecimal(u.approvedHours + u.pendingHours),
    ]),
  ];
  const overtimeSheet = XLSX.utils.aoa_to_sheet(overtimeRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen');
  XLSX.utils.book_append_sheet(workbook, clientSheet, 'Desglose por cliente');
  XLSX.utils.book_append_sheet(workbook, overtimeSheet, 'Horas extra del mes');
  XLSX.writeFile(workbook, `reporte-soporte-${new Date().toISOString().slice(0, 10)}.xlsx`);
}
