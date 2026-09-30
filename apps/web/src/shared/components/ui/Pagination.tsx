import styles from './Pagination.module.css';
import { Select } from './Select';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons/Icons';

/**
 * Paginación.
 *
 * Muestra siempre la primera y la última página, y una ventana alrededor de la
 * actual, con puntos suspensivos entre medias. Pintar los 200 números de una
 * lista larga —que es lo que hacían algunas pantallas de la v1— rompe el diseño
 * y no ayuda a nadie.
 *
 * Si se pasa `onPageSizeChange`, muestra además el selector "Ver N filas".
 */

export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS: readonly number[] = [10, 25, 50];

export interface PaginationProps {
  readonly page: number;
  readonly pageCount: number;
  readonly total: number;
  readonly pageSize: number;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (pageSize: number) => void;
  readonly pageSizeOptions?: readonly number[];
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: PaginationProps) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <nav className={styles.pagination} aria-label="Paginación de resultados">
      <div className={styles.info}>
        {onPageSizeChange && (
          <div className={styles.pageSize}>
            <span className={styles.pageSizeLabel} aria-hidden="true">
              Ver
            </span>
            <Select
              aria-label="Filas por página"
              value={String(pageSize)}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              options={pageSizeOptions.map((size) => ({ value: String(size), label: `${size} Filas` }))}
            />
          </div>
        )}

        <p className={styles.summary}>
          Mostrando {from}–{to} de {total}
        </p>
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.pageButton}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
        >
          <ChevronLeftIcon size={16} />
        </button>

        {buildPageWindow(page, pageCount).map((entry, index) =>
          entry === 'ellipsis' ? (
            <span key={`gap-${index}`} className={styles.ellipsis} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={[styles.pageButton, entry === page ? styles.current : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onPageChange(entry)}
              aria-label={`Página ${entry}`}
              aria-current={entry === page ? 'page' : undefined}
            >
              {entry}
            </button>
          ),
        )}

        <button
          type="button"
          className={styles.pageButton}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Página siguiente"
        >
          <ChevronRightIcon size={16} />
        </button>
      </div>
    </nav>
  );
}

/**
 * Calcula qué números mostrar. Función pura y exportada para poder probarla
 * sin renderizar nada.
 */
export function buildPageWindow(
  current: number,
  pageCount: number,
  windowSize = 1,
): Array<number | 'ellipsis'> {
  if (pageCount <= 1) return [1];

  const pages = new Set<number>([1, pageCount, current]);

  for (let offset = 1; offset <= windowSize; offset += 1) {
    if (current - offset > 1) pages.add(current - offset);
    if (current + offset < pageCount) pages.add(current + offset);
  }

  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];

  sorted.forEach((pageNumber, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && pageNumber - previous > 1) result.push('ellipsis');
    result.push(pageNumber);
  });

  return result;
}
