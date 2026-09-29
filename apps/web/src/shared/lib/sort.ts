import type { SortState } from '@/shared/components/ui/DataTable';

export type SortValue = string | number | null | undefined;

/**
 * Comparador para ordenar filas en el cliente. Los vacíos (`null`,
 * `undefined`, `''`) van siempre al final, sin importar la dirección — una
 * fila "—" arriba de todo al ordenar descendente no le sirve a nadie. Los
 * textos se comparan en español y con números naturales ("Hito 2" < "Hito 10").
 */
export function compareSortValues(a: SortValue, b: SortValue, direction: SortState['direction']): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;

  const result =
    typeof a === 'number' && typeof b === 'number'
      ? a - b
      : String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? result : -result;
}

/** Siguiente estado al hacer clic en un encabezado: misma columna alterna la dirección; otra columna parte ascendente. */
export function nextSortState<TField extends string>(prev: SortState<TField> | null, field: TField): SortState<TField> {
  return prev?.field === field && prev.direction === 'asc' ? { field, direction: 'desc' } : { field, direction: 'asc' };
}
