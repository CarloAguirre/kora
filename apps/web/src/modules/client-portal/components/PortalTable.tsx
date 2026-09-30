import type { ReactNode } from 'react';
import styles from './PortalTable.module.css';
import { Pagination, usePaginatedItems } from '@/shared/components/ui/Pagination';

export interface PortalTableColumn<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (item: T) => ReactNode;
  readonly width?: string;
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
 * tablas internas (10 filas por defecto).
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
  const { pageItems, pagination } = usePaginatedItems(items);

  return (
    <>
      <div className={styles.container}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={styles.headerCell} style={column.width ? { width: column.width } : undefined}>
                  {column.header}
                </th>
              ))}
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
