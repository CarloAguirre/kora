import type { SupportPlanCurrency } from '@kora/contracts';

/** Reemplaza las implementaciones locales de `formatUf` repetidas por página — un contrato ya no es siempre UF. */
export function formatMoney(value: number, currency: SupportPlanCurrency): string {
  if (currency === 'UF') return `${value.toFixed(2)} UF`;
  return `${value.toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${currency}`;
}
