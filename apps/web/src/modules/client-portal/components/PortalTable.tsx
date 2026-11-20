import { useMemo, useState, type ReactNode } from 'react';
import styles from './PortalTable.module.css';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';
import { ArrowUpDownIcon } from '@/shared/components/icons/Icons';

export type PortalSortValue = string | number | null;

export interface PortalTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (item: T) => ReactNode;
  readonly width?: string;
  /** Valor por el que se ordena la columna; sin esto, la cabecera no es clickeable.
   *  `null` = sin dato ("--"): siempre queda al final, en ambos sentidos. */
  readonly sortValue?: (item: T) => PortalSortValue;
}

interface PortalSortState {
  readonly key: string;
  readonly direction: 'asc' | 'desc';
}

function compareSortValues(a: PortalSortValue, b: PortalSortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
}

/**
 * Tabla propia del portal de cliente — a diferencia de `shared/components/ui/DataTable`
 * (cabecera lima, estilo v1), esta replica la cabecera celeste (#E0EEFF) y la
 * tipografía exacta del Figma de referencia. Es un componente nuevo y no un
 * cambio a `DataTable` por la misma razón que `StatusPill` es propio: no
 * reintroducir en las pantallas internas el estilo que ya se revirtió — ver
 * docs/DECISION-DISENO-FIGMA.md y docs/DECISION-PORTAL-CLIENTE.md. No
 * necesita los estados de carga/error/vacío de `DataTable`: esta vista
 * siempre tiene datos (son de ejemplo). Pagina en el cliente, igual que las
 * tablas internas (10 filas por defecto), y ordena en el cliente antes de
 * paginar (las columnas con `sortValue`).
 */
export function PortalTable<T>({
  columns,
  items,
  getRowKey,
}: {
  columns: ReadonlyArray<PortalTableColumn<T>>;
  items: readonly T[];
  getRowKey: (item: T) => string;
}) {
  const [sort, setSort] = useState<PortalSortState | null>(null);

  const sortedItems = useMemo(() => {
    const getValue = sort ? columns.find((column) => column.key === sort.key)?.sortValue : undefined;
    if (!sort || !getValue) return items;
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const valueA = getValue(a);
      const valueB = getValue(b);
      if (valueA == null || valueB == null) return valueA == null ? (valueB == null ? 0 : 1) : -1;
      return compareSortValues(valueA, valueB) * factor;
    });
  }, [items, columns, sort]);

  const { pageItems, pagination } = usePaginatedItems(sortedItems);

  const toggleSort = (key: string) => {
    setSort((current) =>
      current?.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' },
    );
    pagination.onPageChange(1);
  };

  return (
    <>
      <div className={styles.container}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => {
                const canSort = Boolean(column.sortValue);
                const isSorted = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={[styles.headerCell, canSort ? styles.sortable : ''].filter(Boolean).join(' ')}
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : canSort ? 'none' : undefined}
                  >
                    {canSort ? (
                      <button type="button" className={styles.headerButton} onClick={() => toggleSort(column.key)}>
                        {column.header}
                        <ArrowUpDownIcon
                          size={13}
                          className={[styles.sortIcon, isSorted ? styles.sortIconActive : ''].filter(Boolean).join(' ')}
                        />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((item) => (
              <tr key={getRowKey(item)} className={styles.row}>
                {columns.map((column) => (
                  <td key={column.key} className={styles.cell}>
                    {column.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pagination} />
    </>
  );
}
