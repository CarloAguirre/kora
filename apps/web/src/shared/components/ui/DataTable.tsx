import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./DataTable.module.css";
import { ArrowUpDownIcon } from "../icons/Icons";

/**
 * Tabla de datos genérica.
 *
 * Recibe la definición de columnas y cómo pintar cada celda; no sabe nada de
 * usuarios, proyectos ni tickets. Eso permite que la tabla de usuarios sean 40
 * líneas de configuración en lugar de 300 de `<table>` a mano, y que los
 * estados de carga, error y vacío se resuelvan una sola vez para todo el
 * sistema —en la v1 cada pantalla los repetía a su manera, y varias
 * sencillamente no tenían estado vacío.
 */

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly render: (item: T) => ReactNode;
  readonly sortable?: boolean;
  readonly align?: "left" | "right" | "center";
  readonly width?: string;
}

export interface SortState<TField extends string = string> {
  readonly field: TField;
  readonly direction: "asc" | "desc";
}

export interface DataTableProps<T> {
  readonly columns: ReadonlyArray<Column<T>>;
  readonly items: readonly T[];
  readonly getRowKey: (item: T) => string;
  readonly loading?: boolean;
  readonly error?: string | null;
  readonly emptyMessage?: string;
  readonly sort?: SortState;
  readonly onSortChange?: (field: string) => void;
  readonly caption?: string;
  /**
   * Duplica el scroll horizontal arriba de la tabla. Útil en tablas anchas con
   * filas altas, donde el scroll de abajo queda lejos y hay que bajar hasta el
   * final para poder moverse a los lados.
   */
  readonly topScrollbar?: boolean;
}

export function DataTable<T>({
  columns,
  items,
  getRowKey,
  loading = false,
  error = null,
  emptyMessage = "No hay resultados que coincidan con la búsqueda.",
  sort,
  onSortChange,
  caption,
  topScrollbar = false,
}: DataTableProps<T>) {
  const columnCount = columns.length;
  const containerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);

  // El scroll de arriba es un div vacío con el mismo ancho que la tabla: se
  // mide con ResizeObserver para que siga el ancho real (columnas que cambian
  // al cargar datos, ventana que se achica) y se oculta si no hay desborde.
  useEffect(() => {
    if (!topScrollbar) return;
    const container = containerRef.current;
    const table = tableRef.current;
    if (!container || !table) return;

    const measure = () => {
      setScrollWidth(container.scrollWidth);
      setHasOverflow(container.scrollWidth > container.clientWidth + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(table);
    return () => observer.disconnect();
  }, [topScrollbar]);

  const syncScroll = (
    source: HTMLDivElement | null,
    target: HTMLDivElement | null,
  ) => {
    if (source && target && target.scrollLeft !== source.scrollLeft) {
      target.scrollLeft = source.scrollLeft;
    }
  };

  return (
    <>
      {topScrollbar && (
        <div
          ref={topScrollRef}
          className={styles.topScrollbar}
          hidden={!hasOverflow}
          aria-hidden="true"
          onScroll={() =>
            syncScroll(topScrollRef.current, containerRef.current)
          }
        >
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      )}
      <div
        ref={containerRef}
        className={styles.container}
        onScroll={
          topScrollbar
            ? () => syncScroll(containerRef.current, topScrollRef.current)
            : undefined
        }
      >
        <table ref={tableRef} className={styles.table}>
          {caption && <caption className="srOnly">{caption}</caption>}

          <thead>
            <tr>
              {columns.map((column) => {
                const isSorted = sort?.field === column.key;
                const canSort =
                  column.sortable === true && Boolean(onSortChange);

                return (
                  <th
                    key={column.key}
                    scope="col"
                    style={column.width ? { width: column.width } : undefined}
                    className={[
                      styles.headerCell,
                      canSort ? styles.sortable : "",
                      column.align === "right" ? styles.cellActions : "",
                      column.align === "center" ? styles.cellCenter : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    // Comunica el orden a los lectores de pantalla, no solo con el icono.
                    aria-sort={
                      isSorted
                        ? sort?.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : canSort
                          ? "none"
                          : undefined
                    }
                  >
                    {canSort ? (
                      <button
                        type="button"
                        className={styles.headerButton}
                        onClick={() => onSortChange?.(column.key)}
                      >
                        {column.header}
                        <ArrowUpDownIcon
                          size={14}
                          className={[
                            styles.sortIcon,
                            isSorted ? styles.sortIconActive : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
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
            {loading && <SkeletonRows columns={columnCount} />}

            {!loading && error && (
              <tr>
                <td className={styles.stateCell} colSpan={columnCount}>
                  {error}
                </td>
              </tr>
            )}

            {!loading && !error && items.length === 0 && (
              <tr>
                <td className={styles.stateCell} colSpan={columnCount}>
                  {emptyMessage}
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              items.map((item) => (
                <tr key={getRowKey(item)} className={styles.row}>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={[
                        styles.cell,
                        column.align === "right" ? styles.cellActions : "",
                        column.align === "center" ? styles.cellCenter : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {column.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * Filas fantasma durante la carga.
 *
 * Mantienen la altura de la tabla mientras llegan los datos, así que el
 * contenido de alrededor no salta cuando aparecen — y quien mira entiende que
 * está cargando algo con esa forma, no que la tabla esté vacía.
 */
function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 5 }, (_, rowIndex) => (
        <tr key={rowIndex} className={styles.row} aria-hidden="true">
          {Array.from({ length: columns }, (_, cellIndex) => (
            <td key={cellIndex} className={styles.cell}>
              <div
                className={styles.skeletonBar}
                style={{ width: `${60 + ((cellIndex * 13) % 35)}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
