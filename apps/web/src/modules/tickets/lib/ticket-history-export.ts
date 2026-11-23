import * as XLSX from 'xlsx';
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  type TicketContractConsumption,
  type TicketContractConsumptionResponse,
  type TicketContractHourEntry,
  type TicketDailyHours,
  type TicketSummary,
} from '@kora/contracts';
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

/** Fila de la hoja de detalle: de un ticket, o un registro de horas que el contrato consume sin ticket. */
interface DetailRow {
  readonly cells: CellValue[];
  readonly hours: number;
  readonly kind: 'ticket' | TicketContractHourEntry['source'];
  /** Proyecto del ticket (vacío en registros sin ticket). */
  readonly projectId: string;
  /** Contrato en cuyo total cuenta la fila; `null` = no cuenta en ninguno. */
  readonly contractId: string | null;
  readonly countsLabel: string;
}

interface Reconciliation {
  readonly detailedHours: number;
  readonly undetailedHours: number;
  readonly status: string;
}

const ENTRY_SOURCE_LABELS: Record<TicketContractHourEntry['source'], string> = {
  without_ticket: 'Registro sin ticket',
  linked_project: 'Proyecto vinculado al contrato',
  deleted_ticket: 'Registro de ticket eliminado',
};

const OUTSIDE_VALIDITY = 'No: posterior al término del contrato';
const BEFORE_START = 'Sí: anterior al inicio (se suma al primer mes)';

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

/**
 * Contrato en cuyo total cuenta una fila de ticket: el del proyecto del
 * ticket, salvo que la fecha sea posterior a su término. Las anteriores al
 * inicio también cuentan (Kora las suma al primer mes). Las HH sin desglose
 * diario se imputan a la fecha de reporte, igual que en Kora.
 */
function ticketDetailRow(row: DailyRow, contracts: readonly TicketContractConsumption[]): DetailRow {
  const projectId = row.ticket.project?.id ?? '';
  const base = { cells: DETAIL_COLUMNS.map((column) => column.getValue(row)), hours: row.hours, kind: 'ticket' as const, projectId };
  if (row.hours <= 0) return { ...base, contractId: null, countsLabel: '' };
  const contract = contracts.find((item) => item.projectIds.includes(projectId));
  if (!contract) return { ...base, contractId: null, countsLabel: 'No: sin contrato de soporte' };
  const day = row.day || ticketReportDay(row.ticket.createdAt);
  if (contract.endDate !== null && day > contract.endDate) return { ...base, contractId: null, countsLabel: OUTSIDE_VALIDITY };
  return { ...base, contractId: contract.planId, countsLabel: day < contract.startDate ? BEFORE_START : 'Sí' };
}

function entryDetailRow(entry: TicketContractHourEntry, contract: TicketContractConsumption | undefined, clientName: string): DetailRow {
  const title = [entry.category, entry.description].filter(Boolean).join(' — ');
  return {
    // Mismo orden que DETAIL_COLUMNS; "Proyecto Desarrollo" lleva el proyecto al que se cargaron las horas.
    cells: [
      '', title, entry.userFullName, clientName, contract?.name ?? '', '', entry.projectName, '', '', '',
      ticketExcelSerial(entry.date), entry.userFullName, entry.hours, ENTRY_SOURCE_LABELS[entry.source], '',
    ],
    hours: entry.hours,
    kind: entry.source,
    projectId: '',
    contractId: entry.planId,
    countsLabel: 'Sí',
  };
}

/**
 * Por contrato: lo que suma este Excel (filas con "Cuenta en total contrato"
 * = Sí) contra el total que muestra Kora en la ficha del contrato.
 */
function buildContractTotalsSheet(contracts: readonly TicketContractConsumption[], rows: readonly DetailRow[]): XLSX.WorkSheet {
  const headers = [
    'Contrato',
    'HH tickets',
    'HH registros sin ticket',
    'HH proyectos vinculados',
    'HH registros de tickets eliminados',
    'Total Excel',
    'Total contrato en Kora',
    'Diferencia',
    'De las HH tickets: anteriores al inicio (en el primer mes)',
    'HH de tickets posteriores al término (no cuentan)',
  ];
  const body = contracts.map((contract) => {
    const sum = (predicate: (row: DetailRow) => boolean) =>
      roundHours(rows.filter(predicate).reduce((total, row) => total + row.hours, 0));
    const ofKind = (kind: DetailRow['kind']) => sum((row) => row.contractId === contract.planId && row.kind === kind);
    const tickets = ofKind('ticket');
    const withoutTicket = ofKind('without_ticket');
    const linked = ofKind('linked_project');
    const deleted = ofKind('deleted_ticket');
    const total = roundHours(tickets + withoutTicket + linked + deleted);
    const beforeStart = sum((row) => row.contractId === contract.planId && row.countsLabel === BEFORE_START);
    const outside = sum((row) => row.countsLabel === OUTSIDE_VALIDITY && contract.projectIds.includes(row.projectId));
    return [
      contract.name, tickets, withoutTicket, linked, deleted, total, contract.usedHours, roundHours(total - contract.usedHours),
      beforeStart, outside,
    ];
  });
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body]);
  sheet['!cols'] = headers.map((label, index) => ({ wch: index === 0 ? 34 : Math.max(14, Math.min(30, label.length + 2)) }));
  return sheet;
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
      : ['Responsable', 'Registrado por', 'Contrato', 'Proyecto Desarrollo', 'Cuenta en total contrato'].includes(label)
        ? 26
        : Math.max(14, Math.min(28, label.length + 3)),
  }));
}

/**
 * Hojas del mismo conjunto de tickets: el detalle muestra HH aprobadas por
 * día y los saldos sin desglose; el resumen informa ambos por separado. Con
 * contratos de soporte, el detalle suma además las horas que el contrato
 * consume sin ticket y la hoja "Total contrato" cuadra el total del Excel con
 * el de Kora. Las fechas de reporte usan America/Santiago y las de trabajo
 * son DATE puras.
 */
export function buildTicketHistoryWorkbook(
  tickets: readonly TicketSummary[],
  dailyHours: readonly TicketDailyHours[],
  consumption: TicketContractConsumptionResponse = { contracts: [], entries: [] },
): XLSX.WorkBook {
  const { contracts, entries } = consumption;
  const withContracts = contracts.length > 0;
  const byTicket = groupDailyHours(dailyHours);

  const clientOf = (contract: TicketContractConsumption | undefined) =>
    tickets.find((ticket) => ticket.project && contract?.projectIds.includes(ticket.project.id))?.client?.companyName ?? '';
  const detailRows: DetailRow[] = [
    ...buildDailyRows(tickets, byTicket).map((row) => ticketDetailRow(row, contracts)),
    ...entries.map((entry) => {
      const contract = contracts.find((item) => item.planId === entry.planId);
      return entryDetailRow(entry, contract, clientOf(contract));
    }),
  ];

  const detailHeaders = [...DETAIL_COLUMNS.map((column) => column.label), ...(withContracts ? ['Cuenta en total contrato'] : [])];
  const detailSheet = XLSX.utils.aoa_to_sheet([
    detailHeaders,
    ...detailRows.map((row) => (withContracts ? [...row.cells, row.countsLabel] : row.cells)),
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
  if (withContracts) XLSX.utils.book_append_sheet(workbook, buildContractTotalsSheet(contracts, detailRows), 'Total contrato');
  return workbook;
}

/** Evita exportar reportes incompletos cuando las páginas contienen IDs repetidos. */
export function assertTicketHistoryExportComplete(tickets: readonly TicketSummary[], expectedTotal: number): void {
  if (tickets.length !== expectedTotal || new Set(tickets.map((ticket) => ticket.id)).size !== expectedTotal) {
    throw new Error('El historial contiene tickets repetidos o faltantes entre páginas. Intenta descargar nuevamente.');
  }
}

export function exportTicketHistory(
  tickets: readonly TicketSummary[],
  dailyHours: readonly TicketDailyHours[],
  consumption?: TicketContractConsumptionResponse,
) {
  const workbook = buildTicketHistoryWorkbook(tickets, dailyHours, consumption);
  const today = ticketReportDay(new Date().toISOString());
  XLSX.writeFile(workbook, `historial-tickets-${today}.xlsx`, { compression: true });
}
