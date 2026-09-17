import type { SupportPlanAlert } from '@kora/contracts';
import type { SupportMonthlyPeriodRecord, SupportPlanRecord } from '../../domain/repositories/support-plan.repository';

/** Umbral desde el que "vence el cupo acumulado" se muestra como alerta — ajustable, no es una regla financiera. */
const QUOTA_EXPIRING_WARNING_DAYS = 60;

/**
 * Las 3 alertas de negocio del contrato — puras funciones de datos ya
 * cargados por el caso de uso (el plan, sus períodos, y el consumo
 * agregado), sin repositorios propios.
 */
export function computeSupportPlanAlerts(
  plan: SupportPlanRecord,
  periods: readonly SupportMonthlyPeriodRecord[],
  totalUsedHours: number,
  today: Date,
): SupportPlanAlert[] {
  const alerts: SupportPlanAlert[] = [];
  const day = toUtcDate(today);

  if (plan.planType === 'bundle' && totalUsedHours > plan.contractedHours) {
    alerts.push({ type: 'deviated_hours', daysUntilExpiry: null });
  }

  if (plan.planType === 'monthly') {
    const current = findCurrentPeriod(periods, day);

    if (plan.surplusPolicy === 'accumulate') {
      const daysUntilExpiry = daysUntilAccumulatedQuotaExpires(current, day);
      if (daysUntilExpiry !== null && daysUntilExpiry <= QUOTA_EXPIRING_WARNING_DAYS) {
        alerts.push({ type: 'quota_expiring', daysUntilExpiry });
      }
    } else if (current && isLastPeriod(plan, current) && current.consumedHoursPeriod > current.contractedHours) {
      alerts.push({ type: 'last_period_overage', daysUntilExpiry: null });
    }
  }

  return alerts;
}

function findCurrentPeriod(periods: readonly SupportMonthlyPeriodRecord[], day: Date): SupportMonthlyPeriodRecord | undefined {
  return periods.find((period) => period.status === 'active' && period.startDate.getTime() <= day.getTime() && day.getTime() < period.endDate.getTime());
}

function isLastPeriod(plan: SupportPlanRecord, period: SupportMonthlyPeriodRecord): boolean {
  return plan.endDate !== null && period.endDate.getTime() >= plan.endDate.getTime();
}

/**
 * Aproximación, no un cálculo exacto: sin el libro de movimientos de saldo
 * (`support_saldo_horas_movimiento`, deliberadamente fuera de esta pasada —
 * ver docs/DECISION-M5-TICKETS.md) no se puede saber la fecha exacta en que
 * se generó cada hora acumulada. Se aproxima el vencimiento a 1 año desde el
 * inicio del período activo — la regla "máximo 1 año acumulable" que ya
 * declara el wizard de creación.
 */
function daysUntilAccumulatedQuotaExpires(current: SupportMonthlyPeriodRecord | undefined, day: Date): number | null {
  if (!current || current.reusedBalanceHours <= 0) return null;

  const expiresAt = new Date(current.startDate);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  return Math.ceil((expiresAt.getTime() - day.getTime()) / (1000 * 60 * 60 * 24));
}

function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
