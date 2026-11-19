import type { ProjectSummary, SupportProjectUsage } from '@kora/contracts';

/**
 * Cifras de las columnas de horas de la tabla (y el Excel) de Soporte.
 *
 * Con `usage` (contrato activo) son las mismas que "Estado del proyecto" de
 * la ficha: en un plan mensual, el MES en curso (plan + saldo acumulado vs.
 * lo usado este mes); en bolsa / a demanda, la vigencia del contrato.
 *
 * Sin `usage` (sin contrato activo, p. ej. Terminados) se cae a
 * `soldHours`/`usedHours` del proyecto — salvo en planes mensuales, donde
 * comparar las HH de UN mes contra el consumo histórico daba desviaciones
 * absurdas: ahí restantes/desviadas quedan vacías.
 */
export interface SupportHoursFigures {
  /** "A demanda": sin tope de horas — vendidas, restantes y desviadas no aplican. */
  readonly notApplicable: boolean;
  readonly sold: number | null;
  /** Unidad de las vendidas: "/mes" en planes mensuales. */
  readonly soldUnit: string | null;
  readonly priorSurplus: number;
  readonly used: number;
  /**
   * Desglose informativo de las consumidas: lo usado en el mes en curso y en todo el contrato. Solo
   * mensual y bolsa con contrato activo (y mes en curso); `null` en otro caso — a demanda no lo tiene.
   */
  readonly usedBreakdown: { readonly month: number; readonly total: number } | null;
  readonly remaining: number | null;
  readonly deviation: number | null;
}

export function supportHoursOf(project: ProjectSummary, usage: SupportProjectUsage | undefined): SupportHoursFigures {
  if (usage) {
    const { monthUsedHours, contractUsedHours } = usage;
    return {
      notApplicable: usage.planType === 'on_demand',
      sold: usage.planHours,
      soldUnit: usage.planType === 'monthly' ? '/mes' : null,
      priorSurplus: usage.priorSurplusHours,
      used: usage.usedHours,
      usedBreakdown:
        monthUsedHours !== null && contractUsedHours !== null ? { month: monthUsedHours, total: contractUsedHours } : null,
      remaining: usage.remainingHours,
      deviation: usage.deviationHours,
    };
  }

  const planType = project.supportPlanType;
  if (planType === 'on_demand') {
    return { notApplicable: true, sold: null, soldUnit: null, priorSurplus: 0, used: project.usedHours, usedBreakdown: null, remaining: null, deviation: null };
  }
  const isMonthly = planType === 'monthly';
  return {
    notApplicable: false,
    sold: project.soldHours,
    soldUnit: isMonthly ? '/mes' : null,
    priorSurplus: 0,
    used: project.usedHours,
    usedBreakdown: null,
    remaining: isMonthly ? null : Math.max(project.soldHours - project.usedHours, 0),
    deviation: isMonthly ? null : Math.max(project.usedHours - project.soldHours, 0),
  };
}
