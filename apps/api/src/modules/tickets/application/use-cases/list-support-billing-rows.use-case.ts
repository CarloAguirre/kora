import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, buildPage, ok, toOffset, type ApplicationError, type Clock, type Page, type Result } from '@kora/core';
import {
  SUPPORT_PLAN_TYPE_LABELS,
  type ListSupportBillingRowsQuery,
  type SupportBillingRow,
  type SupportBillingRowSortField,
  type SupportInvoiceBillingStatus,
  type SupportInvoicePaymentStatus,
} from '@kora/contracts';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SupportBillingRowBuilder } from '../services/support-billing-row-builder';
import type { UseCase } from '../../../../shared/application/use-case';

type SortValue = string | number | null;

/** Los estados se ordenan por su avance en el flujo de cobro, no alfabéticamente. */
const BILLING_STATUS_ORDER: Readonly<Record<SupportInvoiceBillingStatus, number>> = { to_invoice: 0, invoiced: 1 };
const PAYMENT_STATUS_ORDER: Readonly<Record<SupportInvoicePaymentStatus, number>> = { pending: 0, overdue: 1, paid: 2 };

const ROW_SORT_VALUE: Record<SupportBillingRowSortField, (row: SupportBillingRow) => SortValue> = {
  client: (row) => row.clientName,
  plan: (row) => row.planName,
  type: (row) => SUPPORT_PLAN_TYPE_LABELS[row.planType],
  amount: (row) => row.amountUf,
  billing: (row) => BILLING_STATUS_ORDER[row.billingStatus ?? 'to_invoice'],
  payment: (row) => (row.paymentStatus ? PAYMENT_STATUS_ORDER[row.paymentStatus] : null),
};

/** Campos que se conocen ANTES de calcular el contrato — con ellos se puede ordenar y cortar la página sin calcular el resto. */
const PRE_COMPUTE_SORT_VALUE: Partial<Record<SupportBillingRowSortField, (record: SupportPlanRecord, clientName: string) => SortValue>> = {
  client: (_record, clientName) => clientName,
  type: (record) => SUPPORT_PLAN_TYPE_LABELS[record.planType],
};

/**
 * Tabla del panel de Facturación de Soporte, paginada, filtrada y ordenada
 * en el servidor. Tipo y cliente se filtran en SQL.
 *
 * El monto, los estados y las alertas no son columnas: se calculan por
 * contrato (`SupportBillingRowBuilder`). Por eso hay dos caminos:
 * - Orden por cliente o tipo y sin el filtro "Con alertas": se ordena con lo
 *   que ya trae la consulta, se corta la página y SOLO se calculan esos
 *   contratos — el caso por defecto.
 * - Orden por un campo calculado, o filtro "Con alertas": hay que calcular
 *   todos los contratos que pasaron el filtro SQL antes de poder ordenar o
 *   descartar.
 */
@Injectable()
export class ListSupportBillingRowsUseCase implements UseCase<ListSupportBillingRowsQuery, Page<SupportBillingRow>, ApplicationError> {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    private readonly rowBuilder: SupportBillingRowBuilder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(query: ListSupportBillingRowsQuery): Promise<Result<Page<SupportBillingRow>, ApplicationError>> {
    const now = this.clock.now();
    const pageRequest = { page: query.page, pageSize: query.pageSize };
    const offset = toOffset(pageRequest);
    const direction = query.sortDirection;

    const records = await this.plans.listActive({ planType: query.planType, clientIds: query.clientId });
    const clientNames = await this.rowBuilder.resolveClientNames(records);
    const clientNameOf = (record: SupportPlanRecord) => clientNames.get(record.clientId) ?? '';

    const preComputeValue = PRE_COMPUTE_SORT_VALUE[query.sortField];
    if (preComputeValue && !query.onlyAlerts) {
      const sorted = [...records].sort(
        (a, b) =>
          compareSortValues(preComputeValue(a, clientNameOf(a)), preComputeValue(b, clientNameOf(b)), direction) ||
          compareSortValues(clientNameOf(a), clientNameOf(b), 'asc') ||
          compareSortValues(a.name, b.name, 'asc') ||
          a.id.localeCompare(b.id),
      );
      const pageRecords = sorted.slice(offset, offset + query.pageSize);
      const rows = await this.rowBuilder.buildRows(pageRecords, query.period, now, clientNames);
      return ok(buildPage(rows, records.length, pageRequest));
    }

    const allRows = await this.rowBuilder.buildRows(records, query.period, now, clientNames);
    const filtered = query.onlyAlerts ? allRows.filter((row) => row.hasAlert) : allRows;
    const valueOf = ROW_SORT_VALUE[query.sortField];
    const sorted = [...filtered].sort(
      (a, b) =>
        compareSortValues(valueOf(a), valueOf(b), direction) ||
        compareSortValues(a.clientName, b.clientName, 'asc') ||
        compareSortValues(a.planName, b.planName, 'asc') ||
        a.planId.localeCompare(b.planId),
    );
    return ok(buildPage(sorted.slice(offset, offset + query.pageSize), sorted.length, pageRequest));
  }
}

/**
 * Mismo criterio que `compareSortValues` del front: los vacíos van siempre al
 * final, sin importar la dirección, y los textos se comparan en español con
 * números naturales.
 */
function compareSortValues(a: SortValue, b: SortValue, direction: 'asc' | 'desc'): number {
  const aEmpty = a === null || a === '';
  const bEmpty = b === null || b === '';
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;

  const result =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}
