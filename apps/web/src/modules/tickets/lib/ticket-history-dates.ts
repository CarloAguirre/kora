/** Fechas del historial de tickets: calendario de Chile, independiente del navegador. */
const CHILE_REPORT_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Santiago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Fecha de creación del ticket en calendario chileno, YYYY-MM-DD. */
export function ticketReportDay(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = CHILE_REPORT_DATE.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : '';
}

/** Etiqueta del historial web; misma fecha que se exporta al Excel. */
export function formatTicketReportDate(value: string): string {
  const day = ticketReportDay(value);
  if (!day) return '';
  const [year, month, date] = day.split('-');
  return `${date}-${month}-${year}`;
}

/**
 * Fecha de calendario YYYY-MM-DD -> número de serie real de Excel.
 * No usar new Date('YYYY-MM-DD').getDate(): depende de la zona horaria.
 * El epoch 1899-12-30 incorpora el salto ficticio de 1900 de Excel.
 */
export function ticketExcelSerial(day: string): number | '' {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, date));
  if (utc.getUTCFullYear() !== year ||
      utc.getUTCMonth() !== month - 1 ||
      utc.getUTCDate() !== date) return '';
  return Math.round((utc.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
}
