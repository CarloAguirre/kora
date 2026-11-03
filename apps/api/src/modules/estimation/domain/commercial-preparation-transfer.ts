/** Solo autoriza una excepción al traspaso inicial cuando todo el historial
 * horario anterior es de preparación comercial. No clasificar por la etapa
 * histórica 'Activo': la v1 la guardó así incluso en Prospecto. */
export type CommercialHourEntry = {
  assignment: string | null;
  moduleId: string | null;
  status: 'pending' | 'approved' | 'rejected';
  hours: string | number;
};
const normalize = (name: string) => name.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('es-CL');

export function hasOnlyCommercialPreparationHours(
  entries: readonly CommercialHourEntry[],
  usedHours: number,
): boolean {
  if (!entries.length || !Number.isFinite(usedHours) || usedHours < 0) return false;
  if (!entries.every((entry) => entry.moduleId === null &&
    entry.status === 'approved' &&
    ['prospecto', 'cotizacion'].includes(normalize(entry.assignment ?? '')))) return false;
  const total = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);
  return Number.isFinite(total) && Math.abs(total - usedHours) <= 0.01;
}
