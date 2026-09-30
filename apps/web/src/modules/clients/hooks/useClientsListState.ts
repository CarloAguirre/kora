import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ClientSortField, ClientStatus, ListClientsQuery } from '@kora/contracts';
import type { ClientsFiltersValue } from '../components/ClientsFilters';
import { DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';

export type ClientsStatusTab = 'all' | ClientStatus;

const EMPTY_FILTERS: ClientsFiltersValue = { search: '' };
const SEARCH_DEBOUNCE_MS = 300;

export interface ClientsListState {
  readonly filters: ClientsFiltersValue;
  readonly tab: ClientsStatusTab;
  readonly query: Partial<ListClientsQuery>;
  readonly sort: { field: ClientSortField; direction: 'asc' | 'desc' };
  readonly page: number;
  readonly pageSize: number;
  setFilters(filters: ClientsFiltersValue): void;
  setTab(tab: ClientsStatusTab): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  toggleSort(field: string): void;
}

export function useClientsListState(): ClientsListState {
  const [filters, setFiltersState] = useState<ClientsFiltersValue>(EMPTY_FILTERS);
  const [tab, setTabState] = useState<ClientsStatusTab>('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<{ field: ClientSortField; direction: 'asc' | 'desc' }>({
    field: 'companyName',
    direction: 'asc',
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(filters.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.search]);

  const setFilters = useCallback((next: ClientsFiltersValue) => {
    setFiltersState(next);
    setPage(1);
  }, []);

  const setTab = useCallback((next: ClientsStatusTab) => {
    setTabState(next);
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
        : { field: field as ClientSortField, direction: 'asc' },
    );
    setPage(1);
  }, []);

  const query = useMemo<Partial<ListClientsQuery>>(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      status: tab === 'all' ? undefined : tab,
      sortField: sort.field,
      sortDirection: sort.direction,
    }),
    [page, pageSize, debouncedSearch, tab, sort],
  );

  return { filters, tab, query, sort, page, pageSize, setFilters, setTab, setPage, setPageSize, toggleSort };
}
