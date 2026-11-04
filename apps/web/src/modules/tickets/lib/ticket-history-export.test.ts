import { describe, expect, it } from 'vitest';
import type { TicketDailyHours, TicketSummary } from '@kora/contracts';
import { buildTicketHistoryWorkbook } from './ticket-history-export';
import { formatTicketReportDate, ticketExcelSerial, ticketReportDay } from './ticket-history-dates';

const ticket = (overrides: Partial<TicketSummary> = {}): TicketSummary => ({
  id: '11111111-1111-4111-8111-111111111111',
  code: 'ME1314',
  title: 'Ticket de prueba',
  createdAt: '2026-11-04T01:30:00.000Z',
  status: 'closed',
  usedHours: 12,
  ...overrides,
} as TicketSummary);

const hours = (overrides: Partial<TicketDailyHours> = {}): TicketDailyHours => ({
  ticketId: '11111111-1111-4111-8111-111111111111',
  date: '2026-11-02',
  userFullName: 'Colaborador de prueba',
  hours: 8,
  ...overrides,
});

describe('exportación del historial de tickets', () => {
  it('usa fechas reales de Excel y la misma fecha de reporte chilena en ambas hojas', () => {
    const workbook = buildTicketHistoryWorkbook([ticket()], [hours()]);
    const detail = workbook.Sheets['Detalle por día']!;
    const summary = workbook.Sheets['Resumen por ticket']!;

    // 01:30 UTC del 4/11 todavía es 3/11 en Chile (horario de verano).
    expect(ticketReportDay('2026-11-04T01:30:00.000Z')).toBe('2026-11-03');
    expect(formatTicketReportDate('2026-11-04T01:30:00.000Z')).toBe('03-11-2026');
    expect(detail['J2']?.t).toBe('n');
    expect(detail['J2']?.v).toBe(ticketExcelSerial('2026-11-03'));
    expect(detail['J2']?.z).toBe('dd/mm/yyyy');
    expect(summary['L2']?.v).toBe(detail['J2']?.v);
    expect(summary['L2']?.z).toBe('dd/mm/yyyy');
    expect(detail['K2']?.v).toBe(ticketExcelSerial('2026-11-02'));
    expect(detail['K2']?.z).toBe('dd/mm/yyyy');
    expect(detail['O2']?.v).toBe('Trabajo anterior al reporte (revisar)');
    expect(detail['!autofilter']?.ref).toBe('A1:O3');
    expect(summary['!autofilter']?.ref).toBe('A1:Q2');
  });

  it('explicita las HH sin detalle sin inventar fechas ni responsables', () => {
    const workbook = buildTicketHistoryWorkbook([ticket()], [hours()]);
    const detail = workbook.Sheets['Detalle por día']!;
    const summary = workbook.Sheets['Resumen por ticket']!;

    expect(detail['M2']?.v).toBe(8);
    expect(detail['N2']?.v).toBe('Solicitud aprobada');
    expect(detail['K3']?.v ?? '').toBe('');
    expect(detail['L3']?.v ?? '').toBe('');
    expect(detail['M3']?.v).toBe(4);
    expect(detail['N3']?.v).toBe('Sin detalle diario');
    expect(summary['N2']?.v).toBe(12);
    expect(summary['O2']?.v).toBe(8);
    expect(summary['P2']?.v).toBe(4);
    expect(summary['Q2']?.v).toBe('Faltan HH sin desglose');
  });

  it('no oculta inconsistencias cuando el detalle excede el total del ticket', () => {
    const workbook = buildTicketHistoryWorkbook([ticket({ usedHours: 5 })], [hours()]);
    const detail = workbook.Sheets['Detalle por día']!;
    const summary = workbook.Sheets['Resumen por ticket']!;
    expect(detail['!ref']).toBe('A1:O2'); // no se crea saldo artificial negativo
    expect(summary['O2']?.v).toBe(8);
    expect(summary['P2']?.v).toBe(0);
    expect(summary['Q2']?.v).toBe('Revisar: detalle excede total');
  });

  it('conserva tickets sin HH y nunca multiplica el total del resumen por días', () => {
    const other = ticket({
      id: '22222222-2222-4222-8222-222222222222',
      code: 'IN0002',
      usedHours: 0,
    });
    const workbook = buildTicketHistoryWorkbook([ticket(), other], [
      hours({ hours: 4 }),
      hours({ date: '2026-11-03', hours: 8 }),
    ]);
    const summary = workbook.Sheets['Resumen por ticket']!;
    const detail = workbook.Sheets['Detalle por día']!;
    expect(summary['N2']?.v).toBe(12);
    expect(summary['O2']?.v).toBe(12);
    expect(summary['P2']?.v).toBe(0);
    expect(summary['Q2']?.v).toBe('Conciliado');
    expect(summary['N3']?.v).toBe(0);
    expect(detail['N4']?.v).toBe('Sin horas');
    expect(detail['M4']?.v).toBe(0);
  });

  it('rechaza fechas calendario inválidas y evita corrimientos de zona horaria', () => {
    expect(ticketExcelSerial('2026-02-30')).toBe('');
    expect(ticketExcelSerial('2026-11-04T00:00:00Z')).toBe('');
    expect(ticketExcelSerial('2026-10-29')).toBeGreaterThan(46000);
    expect(ticketReportDay('fecha-inválida')).toBe('');
  });
});
