import type { TransactionContext } from '@kora/core';

/** Horas que consume un contrato en un día (`YYYY-MM-DD`). */
export interface SupportConsumptionDay {
  readonly date: string;
  readonly hours: number;
}

/** Registro de horas aprobado que el contrato consume y que NO sale en el detalle de tickets. */
export interface SupportContractHourEntry {
  readonly id: string;
  readonly date: string;
  readonly hours: number;
  readonly projectId: string;
  readonly projectName: string;
  readonly userFullName: string;
  readonly category: string;
  readonly description: string;
  /** El registro venía de una solicitud de HH de un ticket que después se eliminó. */
  readonly fromDeletedTicket: boolean;
}

/**
 * Consumo de horas de un contrato de soporte — la ÚNICA definición, para que
 * la ficha del contrato, sus períodos mensuales y el Excel del historial de
 * tickets cuenten lo mismo:
 *
 * 1. Registros de horas aprobados de los proyectos del contrato (contenedor
 *    de soporte + proyectos de desarrollo vinculados), con o sin ticket.
 * 2. Horas de tickets que no tienen registro de horas aprobado detrás:
 *    - solicitudes de HH aprobadas sin registro (aprobaciones directas
 *      anteriores al 28/10/2026), a la fecha de la solicitud;
 *    - `used_hours` sin desglose diario (tickets migrados de la v1), a la
 *      fecha de reporte del ticket en America/Santiago.
 *
 * Los tickets eliminados no aportan horas propias (2), pero sus registros de
 * horas aprobados siguen contando (1), igual que antes.
 */
export interface SupportConsumptionReader {
  /** Horas por día en [from, to] (ambos inclusive); `to = null` = sin tope. Días sin horas no vienen. */
  listDailyHours(
    projectIds: readonly string[],
    from: Date,
    to: Date | null,
    context?: TransactionContext,
  ): Promise<SupportConsumptionDay[]>;

  /** Registros aprobados en [from, to] que no respaldan una solicitud aprobada de un ticket vigente — ordenados por fecha. */
  listEntriesWithoutTicket(
    projectIds: readonly string[],
    from: Date,
    to: Date | null,
    context?: TransactionContext,
  ): Promise<SupportContractHourEntry[]>;
}

export const SUPPORT_CONSUMPTION_READER = Symbol('SupportConsumptionReader');

/** Suma los días en [from, toExclusive). */
export function sumConsumptionDays(days: readonly SupportConsumptionDay[], from: Date, toExclusive: Date | null): number {
  const fromKey = isoDay(from);
  const toKey = toExclusive ? isoDay(toExclusive) : null;
  const total = days
    .filter((day) => day.date >= fromKey && (toKey === null || day.date < toKey))
    .reduce((sum, day) => sum + day.hours, 0);
  return Math.round(total * 100) / 100;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
