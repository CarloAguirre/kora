import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CapacityReportSortField, ListCapacityReportQuery } from '@kora/contracts';
import { DEFAULT_PAGE_SIZE } from '@/shared/components/ui/Pagination';

const SEARCH_DEBOUNCE_MS = 300;
const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export interface CapacityPeriodOption {
  readonly value: string;
  readonly label: string;
}

/** Últimos 12 meses (incluido el actual), más reciente primero — igual que `buildCapacityMonthlyPeriodOptions` en la v1. */
function buildCapacityPeriodOptions(count = 12, baseDate = new Date()): CapacityPeriodOption[] {
  const current = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth(), 1));
  return Array.from({ length: count }, (_, index) => {
    const monthDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - index, 1));
    return {
      value: monthDate.toISOString().slice(0, 10),
      label: `${MONTH_LABELS[monthDate.getUTCMonth()]} ${monthDate.getUTCFullYear()}`,
    };
  });
}

export interface CapacityReportState {
  readonly search: string;
  readonly periodOptions: readonly CapacityPeriodOption[];
  readonly periodStart: string;
  readonly sort: { field: CapacityReportSortField; direction: 'asc' | 'desc' };
  readonly page: number;
  readonly pageSize: number;
  readonly query: Partial<ListCapacityReportQuery>;
  setSearch(value: string): void;
  setPeriodStart(value: string): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  toggleSort(field: string): void;
}

/** Estado de la pestaña "Capacity" de Administración — mismo patrón que `useUsersListState`. */
export function useCapacityReportState(): CapacityReportState {
  const periodOptions = useMemo(() => buildCapacityPeriodOptions(), []);
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [periodStart, setPeriodStartState] = useState(periodOptions[0]?.value ?? '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [sort, setSort] = useState<{ field: CapacityReportSortField; direction: 'asc' | 'desc' }>({
    field: 'periodDate',
    direction: 'desc',
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const setSearch = useCallback((value: string) => {
    setSearchState(value);
    setPage(1);
  }, []);

  const setPeriodStart = useCallback((value: string) => {
    setPeriodStartState(value);
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
        : { field: field as CapacityReportSortField, direction: 'asc' },
    );
    setPage(1);
  }, []);

  const query = useMemo<Partial<ListCapacityReportQuery>>(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      periodStart,
      sortField: sort.field,
      sortDirection: sort.direction,
    }),
    [page, pageSize, debouncedSearch, periodStart, sort],
  );

  return {
    search,
    periodOptions,
    periodStart,
    sort,
    page,
    pageSize,
    query,
    setSearch,
    setPeriodStart,
    setPage,
    setPageSize,
    toggleSort,
  };
}
