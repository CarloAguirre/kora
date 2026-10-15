import * as XLSX from 'xlsx';
import type { DashboardOvertimeReportRow } from '@kora/contracts';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Mismo patrón xlsx que `exportSupportReport` — exporta las filas ya filtradas en pantalla (líder). */
export function exportOvertimeReport(rows: readonly DashboardOvertimeReportRow[], year: number, month: number, leaderLabel: string) {
  const sheetRows = [
    [`Horas extra en proyectos de soporte — ${MONTHS[month - 1]} ${year}`],
    [`Líder: ${leaderLabel}`],
    [],
    ['Proyecto', 'Líder', 'Colaborador', 'HH Extra Aprobadas', 'HH Extra Pendientes', 'Total'],
    ...rows.map((row) => [
      row.projectName,
      row.leaderFullName ?? 'Sin líder',
      row.userFullName,
      row.approvedHours,
      row.pendingHours,
      row.approvedHours + row.pendingHours,
    ]),
    [],
    [
      'Total',
      '',
      '',
      rows.reduce((sum, row) => sum + row.approvedHours, 0),
      rows.reduce((sum, row) => sum + row.pendingHours, 0),
      rows.reduce((sum, row) => sum + row.approvedHours + row.pendingHours, 0),
    ],
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetRows), 'Horas extra');
  XLSX.writeFile(workbook, `horas-extra-${year}-${String(month).padStart(2, '0')}.xlsx`);
}
