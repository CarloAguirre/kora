import * as XLSX from 'xlsx';
import { TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS, type TicketDailyHours, type TicketSummary } from '@kora/contracts';
import { ticketExcelSerial, ticketReportDay } from './ticket-history-dates';

const roundHours = (value: number) => Math.round(value * 100) / 100;
const EXCEL_DATE_FORMAT = 'dd/mm/yyyy';
type CellValue = string | number;

interface DailyRow {
  readonly ticket: TicketSummary;
  readonly day: string;
  readonly userFullName: string;
  readonly hours: number;
  readonly source: string;
  readonly dateObservation: string;
}

interface Reconciliation {
  readonly detailedHours: number;
  readonly undetailedHours: number;
  readonly status: string;
}

/** El resumen conserva las columnas históricas en su orden original. */
const COLUMNS: ReadonlyArray<{ label: string; getValue: (ticket: TicketSummary) => CellValue }> = [
  { label: 'Cod. Ticket', getValue: (t) => t.code ?? '' },
  { label: 'Título', getValue: (t) => t.title },
  { label: 'Responsable', getValue: (t) => t.assignee?.fullName ?? 'Sin asignar' },
  { label: 'Incidente', getValue: (t) => t.description ?? '' },
  { label: 'Solución', getValue: (t) => t.resolution ?? '' },
  { label: 'Cliente', getValue: (t) => t.client?.companyName ?? '' },
  { label: 'Contrato', getValue: (t) => t.project?.name ?? '' },
  { label: 'Líder Soporte', getValue: (t) => t.supportLeaderInitials ?? '' },
  { label: 'Proyecto Desarrollo', getValue: (t) => t.developmentProject?.name ?? '' },
  { label: 'Estado', getValue: (t) => TICKET_STATUS_LABELS[t.status] },
  { label: 'Prioridad', getValue: (t) => (t.priority ? TICKET_PRIORITY_LABELS[t.priority] : '') },
  { label: 'F. Reporte', getValue: (t) => ticketExcelSerial(ticketReportDay(t.createdAt)) },
  { label: 'HH Estimadas', getValue: (t) => t.estimatedHours ?? 0 },
  { label: 'HH Utilizadas', getValue: (t) => t.usedHours },
];

const DETAIL_COLUMNS: ReadonlyArray<{ label: string; getValue: (row: DailyRow) => CellValue }> = [
  { label: 'Cod. Ticket', getValue: (r) => r.ticket.code ?? '' },
  { label: 'Título', getValue: (r) => r.ticket.title },
  { label: 'Responsable', getValue: (r) => r.ticket.assignee?.fullName ?? 'Sin asignar' },
  { label: 'Cliente', getValue: (r) => r.ticket.client?.companyName ?? '' },
  { label: 'Contrato', getValue: (r) => r.ticket.project?.name ?? '' },
  { label: 'Líder Soporte', getValue: (r) => r.ticket.supportLeaderInitials ?? '' },
  { label: 'Proyecto Desarrollo', getValue: (r) => r.ticket.developmentProject?.name ?? '' },
  { label: 'Estado', getValue: (r) => TICKET_STATUS_LABELS[r.ticket.status] },
  { label: 'Prioridad', getValue: (r) => (r.ticket.priority ? TICKET_PRIORITY_LABELS[r.ticket.priority] : '') },
  { label: 'F. Reporte', getValue: (r) => ticketExcelSerial(ticketReportDay(r.ticket.createdAt)) },
  { label: 'Fecha trabajada', getValue: (r) => r.day ? ticketExcelSerial(r.day) : '' },
  { label: 'Registrado por', getValue: (r) => r.userFullName },
  { label: 'HH del día', getValue: (r) => r.hours },
  { label: 'Origen HH', getValue: (r) => r.source },
  { label: 'Observación fecha', getValue: (r) => r.dateObservation },
];

function groupDailyHours(dailyHours: readonly TicketDailyHours[]): Map<string, TicketDailyHours[]> {
  const byTicket = new Map<string, TicketDailyHours[]>();
  for (const entry of dailyHours) {
    const list = byTicket.get(entry.ticketId) ?? [];
    list.push(entry);
    byTicket.set(entry.ticketId, list);
  }
  return byTicket;
}

function reconcile(ticket: TicketSummary, days: readonly TicketDailyHours[]): Reconciliation {
  const detailedHours = roundHours(days.reduce((sum, entry) => sum + entry.hours, 0));
  const difference = roundHours(ticket.usedHours - detailedHours);
  return {
    detailedHours,
    undetailedHours: Math.max(0, difference),
    status: difference > 0
      ? 'Faltan HH sin desglose'
      : difference < 0
        ? 'Revisar: detalle excede total'
        : 'Conciliado',
  };
}

/**
 * Los saldos sin respaldo diario siguen siendo visibles para conciliar, pero
 * NUNCA se presentan como si tuvieran fecha de trabajo o usuario registrado.
 * Las fechas anteriores al reporte se señalan para revisión, no se alteran.
 */
function buildDailyRows(
  tickets: readonly TicketSummary[],
  byTicket: ReadonlyMap<string, readonly TicketDailyHours[]>,
): DailyRow[] {
  return tickets.flatMap((ticket) => {
    const days = byTicket.get(ticket.id) ?? [];
    const reportDay = ticketReportDay(ticket.createdAt);
    const rows: DailyRow[] = days.map((entry) => ({
      ticket,
      day: entry.date,
      userFullName: entry.userFullName,
      hours: entry.hours,
      source: 'Solicitud aprobada',
      dateObservation: ticketExcelSerial(entry.date) === ''
        ? 'Fecha de trabajo inválida'
        : reportDay && entry.date < reportDay
          ? 'Trabajo anterior al reporte (revisar)'
          : '',
    }));
    const { undetailedHours } = reconcile(ticket, days);
    if (undetailedHours > 0) {
      rows.push({
        ticket, day: '', userFullName: '', hours: undetailedHours,
        source: 'Sin detalle diario', dateObservation: '',
      });
    }
    if (rows.length === 0) {
      rows.push({
        ticket, day: '', userFullName: '', hours: 0,
        source: 'Sin horas', dateObservation: '',
      });
    }
    return rows;
  });
}

function prepareSheet(sheet: XLSX.WorkSheet, headers: readonly string[], dateColumns: readonly number[], rowCount: number) {
  // Fechas como celdas numéricas de Excel, no texto: filtros y orden cronológico reales.
  for (const col of dateColumns) {
    for (let row = 1; row <= rowCount; row += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell?.t === 'n') cell.z = EXCEL_DATE_FORMAT;
    }
  }
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
  sheet['!cols'] = headers.map((label) => ({
    wch: ['Título', 'Incidente', 'Solución', 'Observación fecha'].includes(label)
      ? 38
      : ['Responsable', 'Registrado por', 'Contrato', 'Proyecto Desarrollo'].includes(label)
        ? 26
        : Math.max(14, Math.min(28, label.length + 3)),
  }));
}

/**
 * Dos hojas del mismo conjunto de tickets: el detalle muestra HH aprobadas
 * por día y los saldos sin desglose; el resumen informa ambos por separado.
 * Las fechas de reporte usan America/Santiago y las de trabajo son DATE puras.
 */
export function buildTicketHistoryWorkbook(
  tickets: readonly TicketSummary[],
  dailyHours: readonly TicketDailyHours[],
): XLSX.WorkBook {
  const byTicket = groupDailyHours(dailyHours);
  const detailRows = buildDailyRows(tickets, byTicket);
  const detailHeaders = DETAIL_COLUMNS.map((column) => column.label);
  const detailSheet = XLSX.utils.aoa_to_sheet([
    detailHeaders,
    ...detailRows.map((row) => DETAIL_COLUMNS.map((column) => column.getValue(row))),
  ]);
  prepareSheet(detailSheet, detailHeaders, [9, 10], detailRows.length);

  const summaryHeaders = [
    ...COLUMNS.map((column) => column.label),
    'HH con detalle diario',
    'HH sin detalle diario',
    'Estado conciliación',
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet([
    summaryHeaders,
    ...tickets.map((ticket) => {
      const reconciliation = reconcile(ticket, byTicket.get(ticket.id) ?? []);
      return [
        ...COLUMNS.map((column) => column.getValue(ticket)),
        reconciliation.detailedHours,
        reconciliation.undetailedHours,
        reconciliation.status,
      ];
    }),
  ]);
  prepareSheet(summarySheet, summaryHeaders, [11], tickets.length);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle por día');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen por ticket');
  return workbook;
}

/** Evita exportar reportes incompletos cuando las páginas contienen IDs repetidos. */
export function assertTicketHistoryExportComplete(tickets: readonly TicketSummary[], expectedTotal: number): void {
  if (tickets.length !== expectedTotal || new Set(tickets.map((ticket) => ticket.id)).size !== expectedTotal) {
    throw new Error('El historial contiene tickets repetidos o faltantes entre páginas. Intenta descargar nuevamente.');
  }
}

export function exportTicketHistory(tickets: readonly TicketSummary[], dailyHours: readonly TicketDailyHours[]) {
  const workbook = buildTicketHistoryWorkbook(tickets, dailyHours);
  const today = ticketReportDay(new Date().toISOString());
  XLSX.writeFile(workbook, `historial-tickets-${today}.xlsx`, { compression: true });
}
