import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ListUsersQuery, UserSortField } from '@kora/contracts';
import type { UsersFiltersValue } from '../components/UsersFilters';
import { DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';

const EMPTY_FILTERS: UsersFiltersValue = { search: '', role: '', status: '' };
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Estado del listado: filtros, orden y página.
 *
 * Sacarlo de la página deja a ésta ocupándose solo de componer la interfaz, y
 * concentra aquí dos detalles fáciles de olvidar:
 *
 *  1. La búsqueda se retrasa 300 ms. Sin eso, escribir "Fernández" lanzaría
 *     nueve peticiones.
 *  2. Cambiar un filtro vuelve a la página 1. Sin eso, filtrar estando en la
 *     página 4 de 6 puede dejar la tabla vacía sin motivo aparente — un fallo
 *     clásico y desconcertante.
 */
export interface UsersListState {
  readonly filters: UsersFiltersValue;
  readonly query: Partial<ListUsersQuery>;
  readonly sort: { field: UserSortField; direction: 'asc' | 'desc' };
  readonly page: number;
  readonly pageSize: number;
  setFilters(filters: UsersFiltersValue): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  toggleSort(field: string): void;
}

export function useUsersListState(): UsersListState {
  const [filters, setFiltersState] = useState<UsersFiltersValue>(EMPTY_FILTERS);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<{ field: UserSortField; direction: 'asc' | 'desc' }>({
    field: 'firstName',
    direction: 'asc',
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const setFilters = useCallback((next: UsersFiltersValue) => {
    setFiltersState(next);
    setPage(1);
  }, []);

  const setPageSize = useCallback((next: number) => {
    setPageSizeState(next);
    setPage(1);
  }, []);

  const toggleSort = useCallback((field: string) => {
    setSort((current) =>
      current.field === field
        ? { field: current.field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field: field as UserSortField, direction: 'asc' },
    );
    setPage(1);
  }, []);

  const query = useMemo<Partial<ListUsersQuery>>(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      role: filters.role || undefined,
      status: filters.status || undefined,
      sortField: sort.field,
      sortDirection: sort.direction,
    }),
    [page, pageSize, debouncedSearch, filters.role, filters.status, sort],
  );

  return { filters, query, sort, page, pageSize, setFilters, setPage, setPageSize, toggleSort };
}
