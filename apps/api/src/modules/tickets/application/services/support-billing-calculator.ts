import { Inject, Injectable } from '@nestjs/common';
import { HOUR_ENTRY_REPOSITORY, type HourEntryRepository } from '../../../hours/domain/repositories/hour-entry.repository';
import type { SupportMonthlyPeriodRecord, SupportPlanRecord } from '../../domain/repositories/support-plan.repository';
import {
  SUPPORT_INVOICE_REPOSITORY,
  type SupportInvoiceRecord,
  type SupportInvoiceRepository,
} from '../../domain/repositories/support-invoice.repository';
import { SupportMonthlyPeriodReconciler } from './support-monthly-period-reconciler';

export interface SupportBillingCalculation {
  readonly amountUf: number;
  readonly hoursBilled: number | null;
  /** 'YYYY-MM'. */
  readonly periodKey: string;
  readonly monthlyPeriodId: string | null;
}

/**
 * Calcula cuánto corresponde facturar HOY por un plan de soporte. Es lógica
 * financiera — la única regla de todo este trabajo que el propio
 * `docs/PLAN-MODULOS.md` marca como la que "merece los tests más estrictos
 * del proyecto" — así que vive aislada de `MarkSupportInvoiceIssuedUseCase`
 * (que solo orquesta: calcula, congela el resultado en una fila de
 * `support_invoices`, y en `on_demand` enlaza los tickets facturados).
 *
 * Nunca vuelve a cobrar lo ya facturado: en `on_demand` factura toda hora
 * aprobada que aún no entró en una factura (no solo las del mes calendario —
 * si no, las horas de un mes que se cerró sin facturar quedaban sin cobrar);
 * en `bundle`, la bolsa completa de una vez en su primera factura, más el
 * excedente NUEVO desde la última; en `monthly`, la cuota del período (HH del
 * período × valor hora) más el excedente aún no facturado de ese período y los
 * anteriores (ver `calculateMonthly`).
 */
@Injectable()
export class SupportBillingCalculator {
  constructor(
    private readonly periods: SupportMonthlyPeriodReconciler,
    @Inject(HOUR_ENTRY_REPOSITORY) private readonly hourEntries: HourEntryRepository,
    @Inject(SUPPORT_INVOICE_REPOSITORY) private readonly invoices: SupportInvoiceRepository,
  ) {}

  /** `null` cuando no hay nada que facturar hoy (monto 0) — nunca se factura una fila con monto 0. */
  async calculate(
    plan: SupportPlanRecord,
    linkedProjectIds: readonly string[],
    today: Date,
    options: { readonly monthlyPeriodId?: string } = {},
  ): Promise<SupportBillingCalculation | null> {
    if (plan.planType === 'on_demand') return this.calculateOnDemand(plan, linkedProjectIds, today);
    if (plan.planType === 'bundle') return this.calculateBundle(plan, linkedProjectIds, today);
    return this.calculateMonthly(plan, today, options.monthlyPeriodId);
  }

  private async calculateOnDemand(
    plan: SupportPlanRecord,
    linkedProjectIds: readonly string[],
    today: Date,
  ): Promise<SupportBillingCalculation | null> {
    const day = toUtcDate(today);
    const totalHours = await this.hourEntries.sumApprovedHoursForProjects(linkedProjectIds, plan.startDate, day);
    const alreadyBilled = await this.invoices.sumHoursBilledForPlan(plan.id);
    const hours = round2(Math.max(0, totalHours - alreadyBilled));
    if (hours <= 0) return null;

    return { amountUf: round2(hours * plan.planValueUf), hoursBilled: hours, periodKey: periodKeyOf(day), monthlyPeriodId: null };
  }

  private async calculateBundle(
    plan: SupportPlanRecord,
    linkedProjectIds: readonly string[],
    today: Date,
  ): Promise<SupportBillingCalculation | null> {
    const day = toUtcDate(today);
    const totalUsed = await this.hourEntries.sumApprovedHoursForProjects(linkedProjectIds, plan.startDate, day);
    const totalOverage = Math.max(0, totalUsed - plan.contractedHours);

    // `hours_billed` de una bolsa guarda solo horas de EXCEDENTE — las de la bolsa misma se cobran una sola vez, en la primera factura del contrato.
    const alreadyBilled = await this.invoices.sumHoursBilledForPlan(plan.id);
    const newOverage = Math.max(0, totalOverage - alreadyBilled);
    const bundleAlreadyBilled = (await this.invoices.listForPlan(plan.id)).length > 0;
    const bundleAmount = bundleAlreadyBilled ? 0 : plan.contractedHours * plan.planValueUf;

    const amountUf = round2(bundleAmount + newOverage * plan.extraHourValueUf);
    if (amountUf <= 0) return null;

    return {
      amountUf,
      hoursBilled: newOverage > 0 ? newOverage : null,
      periodKey: periodKeyOf(day),
      monthlyPeriodId: null,
    };
  }

  /**
   * Por defecto factura el período vigente; con `monthlyPeriodId`, también uno
   * ya cerrado que quedó sin factura (nunca uno futuro: todavía no existe).
   *
   * Cuota del período + excedente aún no cobrado — ver `unbilledMonthlyOverageHours`.
   */
  private async calculateMonthly(plan: SupportPlanRecord, today: Date, monthlyPeriodId?: string): Promise<SupportBillingCalculation | null> {
    const day = toUtcDate(today);
    const periods = await this.periods.listPeriods(plan, today);
    const target = monthlyPeriodId
      ? periods.find((period) => period.id === monthlyPeriodId && period.status !== 'cancelled' && period.startDate.getTime() <= day.getTime())
      : periods.find(
          (period) => period.status === 'active' && period.startDate.getTime() <= day.getTime() && day.getTime() < period.endDate.getTime(),
        );
    if (!target) return null;

    const invoices = await this.invoices.listForPlan(plan.id);
    const newOverage = unbilledMonthlyOverageHours(plan, periods, invoices, target);

    const amountUf = round2(target.contractedHours * plan.planValueUf + newOverage * plan.extraHourValueUf);
    if (amountUf <= 0) return null;

    return {
      amountUf,
      hoursBilled: newOverage > 0 ? newOverage : null,
      periodKey: periodKeyOf(target.startDate),
      monthlyPeriodId: target.id,
    };
  }
}

type MonthlyChargePlan = Pick<SupportPlanRecord, 'planValueUf' | 'extraHourValueUf' | 'surplusPolicy'>;
type MonthlyChargePeriod = Pick<SupportMonthlyPeriodRecord, 'contractedHours' | 'reusedBalanceHours' | 'consumedHoursPeriod'>;

/**
 * HH de un período que superan su cupo y se cobran como hora extra. El cupo
 * son las HH del período; con política acumulable, más el saldo no usado que
 * arrastra de meses anteriores (igual criterio que
 * `SupportPlanSummaryBuilder.buildMonthlySummary`).
 */
export function monthlyPeriodOverageHours(plan: MonthlyChargePlan, period: MonthlyChargePeriod): number {
  const priorSurplus = plan.surplusPolicy === 'accumulate' ? period.reusedBalanceHours : 0;
  return round2(Math.max(0, period.consumedHoursPeriod - (period.contractedHours + priorSurplus)));
}

/**
 * Excedente que le toca cobrar a la factura de `target`: el de `target` y el
 * del período anterior que no haya entrado en una factura.
 *
 * Por qué también el anterior: un mes se factura apenas empieza (o antes de
 * terminar), cuando su excedente todavía no existe o está incompleto; lo que
 * se registra después lo cobra la factura del mes siguiente. Por qué no más
 * atrás: los meses viejos (también los migrados de la v1) ya están cerrados y
 * conciliados — arrastrarlos cobraría de golpe excedentes que nadie esperaba.
 *
 * Se simula en orden: cada período suma su excedente a la bolsa; la factura de
 * cada período descuenta su `hours_billed` de lo pendiente de ese período y del
 * anterior (primero lo más antiguo), y lo de períodos más viejos se descarta.
 * Pura.
 */
export function unbilledMonthlyOverageHours(
  plan: MonthlyChargePlan,
  periods: readonly SupportMonthlyPeriodRecord[],
  invoices: readonly Pick<SupportInvoiceRecord, 'monthlyPeriodId' | 'periodKey' | 'hoursBilled'>[],
  target: SupportMonthlyPeriodRecord,
): number {
  const chain = periods
    .filter((period) => period.status !== 'cancelled' && period.startDate.getTime() <= target.startDate.getTime())
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  let previousPending = 0;
  let pending = 0;
  for (const period of chain) {
    previousPending = pending;
    pending = monthlyPeriodOverageHours(plan, period);
    if (period.id === target.id) break;

    const periodKey = periodKeyOf(period.startDate);
    const invoice =
      invoices.find((item) => item.monthlyPeriodId === period.id) ?? invoices.find((item) => item.periodKey === periodKey);
    let billed = invoice?.hoursBilled ?? 0;
    const fromPrevious = Math.min(previousPending, billed);
    previousPending -= fromPrevious;
    billed -= fromPrevious;
    pending = Math.max(0, pending - billed);
  }
  return round2(previousPending + pending);
}

/**
 * Lo que se cobra por UN período mensual, contado solo: la cuota (`planValueUf`
 * es el valor de la HORA — así lo pide y lo muestra toda la UI, igual que en
 * bolsa/a demanda —, así que la cuota son las HH del período × ese valor) más
 * su excedente al valor de hora extra. Pura: la usa el calendario de
 * facturación de la ficha del contrato para los meses sin factura; la factura
 * real descuenta además el excedente ya cobrado (ver `calculateMonthly`).
 */
export function monthlyPeriodCharge(
  plan: MonthlyChargePlan,
  period: MonthlyChargePeriod,
): { amountUf: number; hoursBilled: number | null } {
  const overage = monthlyPeriodOverageHours(plan, period);
  return {
    amountUf: round2(period.contractedHours * plan.planValueUf + overage * plan.extraHourValueUf),
    hoursBilled: overage > 0 ? overage : null,
  };
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function periodKeyOf(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
