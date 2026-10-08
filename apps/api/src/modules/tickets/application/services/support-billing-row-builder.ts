import { Inject, Injectable } from '@nestjs/common';
import type { SupportBillingRow } from '@kora/contracts';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import { SUPPORT_PLAN_REPOSITORY, type SupportPlanRecord, type SupportPlanRepository } from '../../domain/repositories/support-plan.repository';
import { SUPPORT_INVOICE_REPOSITORY, type SupportInvoiceRecord, type SupportInvoiceRepository } from '../../domain/repositories/support-invoice.repository';
import { TICKET_CLIENT_READER, type TicketClientReader } from '../ports/ticket-client-reader.port';
import { TICKET_PROJECT_READER, type TicketProjectReader } from '../ports/ticket-project-reader.port';
import { computeSupportPlanAlerts } from './support-plan-alerts';
import { SupportMonthlyPeriodReconciler } from './support-monthly-period-reconciler';
import { SupportPlanCurrentBillingResolver, type CurrentBillingStatus } from './support-plan-current-billing.resolver';
import { resolveSupportPlanName } from './support-plan-naming';
import { resolveSupportPlanHourProjectIds } from './support-plan-linked-projects';
import { paymentStatusOf } from './support-invoice-payment-status';

/**
 * Cuántos contratos se calculan a la vez. Cada uno abre varias consultas (y
 * una transacción si hay que reconciliar períodos `monthly`); con el pool de
 * 10 conexiones de la API, 5 deja aire para el resto de los requests.
 */
const ROW_CONCURRENCY = 5;

/** Sin "Sin movimiento": un contrato sin nada pendiente se muestra "Por facturar" con monto 0. */
interface BillingCell {
  readonly amountUf: number;
  readonly billingStatus: 'to_invoice' | 'invoiced';
  readonly paymentStatus: SupportBillingRow['paymentStatus'];
}

/**
 * Arma las filas del panel de Facturación de Soporte — lo comparten el
 * endpoint de KPIs (`GetSupportBillingOverviewUseCase`, que necesita TODOS
 * los contratos) y el de la tabla paginada (`ListSupportBillingRowsUseCase`,
 * que solo calcula los de la página cuando puede). Un caso de uso no puede
 * importar a otro (ver `architecture.spec.ts`), así que vive aquí.
 *
 * Regla obligatoria: SOLO el período en curso (el mes calendario de hoy)
 * calcula un monto en vivo. Cualquier otro período consultado — pasado o
 * futuro — muestra únicamente facturas que existen de verdad; si no hay
 * ninguna, la fila queda "Por facturar" con monto 0. Sin esta regla, abrir un período
 * viejo inventaría deuda en todos los contratos (mismo criterio que
 * `getCycle()` en el prototipo de referencia: solo el período vigente es
 * editable, el resto es historial de solo lectura).
 */
@Injectable()
export class SupportBillingRowBuilder {
  constructor(
    @Inject(SUPPORT_PLAN_REPOSITORY) private readonly plans: SupportPlanRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(TICKET_CLIENT_READER) private readonly clients: TicketClientReader,
    @Inject(TICKET_PROJECT_READER) private readonly projects: TicketProjectReader,
    private readonly currentBilling: SupportPlanCurrentBillingResolver,
    private readonly periods: SupportMonthlyPeriodReconciler,
  ) {}

  /** Nombres de cliente de los contratos dados, en una sola consulta. */
  async resolveClientNames(records: readonly SupportPlanRecord[]): Promise<Map<string, string>> {
    return this.clients.findCompanyNames(records.map((record) => record.clientId));
  }

  /**
   * Una fila por contrato, en el mismo orden de `records`. Las facturas y los
   * nombres de cliente se traen en lote; el resto (períodos, monto en vivo)
   * depende de cada contrato y se calcula en paralelo, acotado.
   */
  async buildRows(
    records: readonly SupportPlanRecord[],
    period: string,
    now: Date,
    clientNames?: Map<string, string>,
  ): Promise<SupportBillingRow[]> {
    if (records.length === 0) return [];

    const [names, invoices] = await Promise.all([
      clientNames ?? this.resolveClientNames(records),
      this.invoices.listForPlans(records.map((record) => record.id)),
    ]);
    const invoicesByPlan = groupBy(invoices, (invoice) => invoice.planId);

    return mapWithConcurrency(records, ROW_CONCURRENCY, (record) =>
      this.buildRow(record, period, now, names.get(record.clientId) ?? '', invoicesByPlan.get(record.id) ?? []),
    );
  }

  private async buildRow(
    record: SupportPlanRecord,
    period: string,
    now: Date,
    clientName: string,
    planInvoices: readonly SupportInvoiceRecord[],
  ): Promise<SupportBillingRow> {
    const isLivePeriod = period === periodKeyOf(now);
    const linkedIds = await resolveSupportPlanHourProjectIds(this.plans, record);
    // `listPeriods` reconcilia la cadena de un `monthly` — tiene que correr antes que `currentBilling.resolve`, que lee el período vigente.
    const periods = await this.periods.listPeriods(record, now);
    const [current, usedHours] = await Promise.all([
      this.currentBilling.resolve(record, linkedIds, now),
      this.usedHoursForAlerts(record, linkedIds),
    ]);
    // Mismo criterio que la ficha del contrato (`SupportPlanBillingAction`): una alerta solo pide revisión mientras el período en curso siga por facturar — una vez registrada la factura, queda resuelta y no debe seguir contando acá.
    const hasAlert = current.billingStatus === 'to_invoice' && computeSupportPlanAlerts(record, periods, usedHours, now).length > 0;
    const isOverdue = planInvoices.some((invoice) => paymentStatusOf(invoice, now) === 'overdue');

    // Migrados por el ETL antes de que `name` existiera como columna — sin este fallback, el panel mostraría el nombre en blanco para los 30 contratos legados.
    const linkedProjects = record.name ? [] : await this.projects.findManyByIds(linkedIds);
    const planName = resolveSupportPlanName(record.name, record.scope, linkedProjects.map((p) => p.name), clientName);

    const { amountUf, billingStatus, paymentStatus } = isLivePeriod
      ? currentPeriodCell(current, planInvoices, now)
      : pastPeriodCell(planInvoices, period, now);

    return {
      planId: record.id,
      planName,
      clientId: record.clientId,
      clientName,
      scope: record.scope,
      planType: record.planType,
      amountUf,
      currency: record.currency,
      billingStatus,
      paymentStatus,
      hasAlert,
      isOverdue,
    };
  }

  /**
   * `computeSupportPlanAlerts` solo mira las horas consumidas en `bundle`
   * ("horas desviadas"); `monthly` usa sus períodos y `on_demand` no tiene
   * alerta de consumo. Antes esto armaba el resumen completo
   * (`SupportPlanSummaryBuilder.build`) — que trae hasta 2000 registros de
   * horas por proyecto — solo para leer el total; un `SUM` da lo mismo.
   */
  private async usedHoursForAlerts(record: SupportPlanRecord, linkedIds: readonly string[]): Promise<number> {
    if (record.planType !== 'bundle') return 0;
    const sums = await Promise.all(linkedIds.map((projectId) => this.hourEntries.sumApprovedHoursForProject(projectId)));
    return sums.reduce((total, hours) => total + hours, 0);
  }
}

function currentPeriodCell(current: CurrentBillingStatus, planInvoices: readonly SupportInvoiceRecord[], now: Date): BillingCell {
  if (current.billingStatus === 'invoiced') {
    const invoice = planInvoices.find((item) => item.periodKey === periodKeyOf(now));
    return { amountUf: current.amountUf, billingStatus: 'invoiced', paymentStatus: invoice ? paymentStatusOf(invoice, now) : null };
  }
  return { amountUf: current.amountUf, billingStatus: 'to_invoice', paymentStatus: null };
}

function pastPeriodCell(planInvoices: readonly SupportInvoiceRecord[], period: string, now: Date): BillingCell {
  const invoice = planInvoices.find((item) => item.periodKey === period);
  if (!invoice) return { amountUf: 0, billingStatus: 'to_invoice', paymentStatus: null };
  return { amountUf: invoice.amountUf, billingStatus: 'invoiced', paymentStatus: paymentStatusOf(invoice, now) };
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/** `Promise.all` con a lo sumo `limit` tareas en vuelo; conserva el orden de `items`. */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await task(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
