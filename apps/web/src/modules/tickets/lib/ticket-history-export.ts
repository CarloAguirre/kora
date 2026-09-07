import * as XLSX from 'xlsx';
import { TICKET_STATUS_LABELS, TICKET_PRIORITY_LABELS, type TicketSummary } from '@kora/contracts';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CL');
}

const COLUMNS: ReadonlyArray<{ label: string; getValue: (ticket: TicketSummary) => string | number }> = [
  { label: 'Cod. Ticket', getValue: (t) => t.code ?? '' },
  { label: 'Título', getValue: (t) => t.title },
  { label: 'Cliente', getValue: (t) => t.client?.companyName ?? '' },
  { label: 'Proyecto Soporte', getValue: (t) => t.project?.name ?? '' },
  { label: 'Responsable', getValue: (t) => t.assignee?.fullName ?? 'Sin asignar' },
  { label: 'Estado', getValue: (t) => TICKET_STATUS_LABELS[t.status] },
  { label: 'Prioridad', getValue: (t) => (t.priority ? TICKET_PRIORITY_LABELS[t.priority] : '') },
  { label: 'F. Reporte', getValue: (t) => formatDate(t.createdAt) },
  { label: 'HH Estimadas', getValue: (t) => t.estimatedHours ?? 0 },
  { label: 'HH Utilizadas', getValue: (t) => t.usedHours },
];

/** Exporta el historial de tickets (respetando los filtros aplicados) — reemplaza a "Descargar Excel (todos los estados)" de la v1. */
export function exportTicketHistory(rows: readonly TicketSummary[]) {
  const sheetRows = [COLUMNS.map((c) => c.label), ...rows.map((row) => COLUMNS.map((c) => c.getValue(row)))];
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `historial-tickets-${today}.xlsx`);
}
