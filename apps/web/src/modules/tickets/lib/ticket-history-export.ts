import * as XLSX from 'xlsx';
import { TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS, type TicketDailyHours, type TicketSummary } from '@kora/contracts';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CL');
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY' sin pasar por `Date` (evita el corrimiento de zona horaria). */
function formatDay(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

const roundHours = (value: number) => Math.round(value * 100) / 100;

// Mismo orden que HISTORY_TICKET_DATA_COLUMNS (v1) — quien exportaba esta
// planilla todos los meses la sigue reconociendo columna por columna.
const COLUMNS: ReadonlyArray<{ label: string; getValue: (ticket: TicketSummary) => string | number }> = [
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
  { label: 'F. Reporte', getValue: (t) => formatDate(t.createdAt) },
  { label: 'HH Estimadas', getValue: (t) => t.estimatedHours ?? 0 },
  { label: 'HH Utilizadas', getValue: (t) => t.usedHours },
];

/** Una fila por ticket + día + persona. Sin "HH Estimadas"/"HH Utilizadas": repetidas en cada día, sumar la columna las multiplicaría. */
interface DailyRow {
  readonly ticket: TicketSummary;
  readonly date: string;
  readonly userFullName: string;
  readonly hours: number;
}

const DETAIL_COLUMNS: ReadonlyArray<{ label: string; getValue: (row: DailyRow) => string | number }> = [
  { label: 'Cod. Ticket', getValue: (r) => r.ticket.code ?? '' },
  { label: 'Título', getValue: (r) => r.ticket.title },
  { label: 'Responsable', getValue: (r) => r.ticket.assignee?.fullName ?? 'Sin asignar' },
  { label: 'Cliente', getValue: (r) => r.ticket.client?.companyName ?? '' },
  { label: 'Contrato', getValue: (r) => r.ticket.project?.name ?? '' },
  { label: 'Líder Soporte', getValue: (r) => r.ticket.supportLeaderInitials ?? '' },
  { label: 'Proyecto Desarrollo', getValue: (r) => r.ticket.developmentProject?.name ?? '' },
  { label: 'Estado', getValue: (r) => TICKET_STATUS_LABELS[r.ticket.status] },
  { label: 'Prioridad', getValue: (r) => (r.ticket.priority ? TICKET_PRIORITY_LABELS[r.ticket.priority] : '') },
  { label: 'F. Reporte', getValue: (r) => formatDate(r.ticket.createdAt) },
  { label: 'Fecha', getValue: (r) => r.date },
  { label: 'Registrado por', getValue: (r) => r.userFullName },
  { label: 'HH del día', getValue: (r) => r.hours },
];

/**
 * Despliega cada ticket en sus días con horas. Las horas de `usedHours` que no
 * tienen solicitud de HH detrás (tickets migrados de la v1, que solo traían el
 * total) van en una fila "Sin detalle diario", para que la hoja sume lo mismo
 * que el resumen. Un ticket sin horas igual aparece, con una fila en 0.
 */
function buildDailyRows(tickets: readonly TicketSummary[], dailyHours: readonly TicketDailyHours[]): DailyRow[] {
  const byTicket = new Map<string, TicketDailyHours[]>();
  for (const entry of dailyHours) {
    const list = byTicket.get(entry.ticketId);
    if (list) list.push(entry);
    else byTicket.set(entry.ticketId, [entry]);
  }

  return tickets.flatMap((ticket) => {
    const days = byTicket.get(ticket.id) ?? [];
    const rows: DailyRow[] = days.map((d) => ({ ticket, date: formatDay(d.date), userFullName: d.userFullName, hours: d.hours }));
    const undetailed = roundHours(ticket.usedHours - days.reduce((sum, d) => sum + d.hours, 0));
    if (undetailed > 0) rows.push({ ticket, date: 'Sin detalle diario', userFullName: '', hours: undetailed });
    if (rows.length === 0) rows.push({ ticket, date: '', userFullName: '', hours: 0 });
    return rows;
  });
}

/**
 * Exporta el historial de tickets (respetando los filtros aplicados) — reemplaza a "Descargar Excel (todos los estados)" de la v1.
 * Primera hoja: las horas desglosadas por día; segunda: una fila por ticket con el total, como la v1.
 * `dailyHours` debe venir sin filtro de mes (el remanente "Sin detalle diario" se calcula contra el total del ticket).
 */
export function exportTicketHistory(rows: readonly TicketSummary[], dailyHours: readonly TicketDailyHours[]) {
  const detailRows = buildDailyRows(rows, dailyHours);
  const detailSheet = XLSX.utils.aoa_to_sheet([
    DETAIL_COLUMNS.map((c) => c.label),
    ...detailRows.map((row) => DETAIL_COLUMNS.map((c) => c.getValue(row))),
  ]);
  const summarySheet = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.label), ...rows.map((row) => COLUMNS.map((c) => c.getValue(row)))]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, detailSheet, 'Detalle por día');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Resumen por ticket');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `historial-tickets-${today}.xlsx`);
}
