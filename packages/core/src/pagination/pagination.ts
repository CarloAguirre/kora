/** Contrato de paginación compartido por todos los listados del sistema. */

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface SortRequest<TField extends string = string> {
  readonly field: TField;
  readonly direction: 'asc' | 'desc';
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
}

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

export function buildPage<T>(items: readonly T[], total: number, request: PageRequest): Page<T> {
  return {
    items,
    total,
    page: request.page,
    pageSize: request.pageSize,
    pageCount: request.pageSize > 0 ? Math.ceil(total / request.pageSize) : 0,
  };
}

export function toOffset(request: PageRequest): number {
  return (request.page - 1) * request.pageSize;
}

/** Transforma los elementos de una página conservando los metadatos. */
export function mapPage<T, U>(page: Page<T>, fn: (item: T) => U): Page<U> {
  return { ...page, items: page.items.map(fn) };
}
