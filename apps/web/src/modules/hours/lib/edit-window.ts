import type { RoleCode } from '@kora/contracts';

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Un registro de horas solo se edita o elimina dentro del mes en curso — misma
 * regla que el backend (`HOUR_ENTRY_OUTSIDE_CURRENT_MONTH`), acá solo para no
 * ofrecer acciones que van a fallar. Mes local, no UTC.
 */
export function isInCurrentMonth(isoDate: string, now = new Date()): boolean {
  return isoDate.slice(0, 7) === `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

/** Admin/PMO editan y eliminan cualquier registro, sin la ventana del mes en curso. */
export function canEditAnyMonth(role: RoleCode | undefined): boolean {
  return role === 'admin' || role === 'pmo';
}

export const OUTSIDE_CURRENT_MONTH_MESSAGE = 'Solo se pueden editar registros del mes en curso.';
