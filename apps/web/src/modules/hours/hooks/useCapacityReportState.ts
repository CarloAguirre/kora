import { useCallback, useEffect, useMemo, useState } from 'react';
import { CAPACITY_REPORT_MAX_RANGE_DAYS, type CapacityReportSortField, type ListCapacityReportQuery } from '@kora/contracts';
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

/** Último día del mes de `monthStart` (`yyyy-mm-01`), en `yyyy-mm-dd`. */
function monthEndOf(monthStart: string): string {
  const [year, month] = monthStart.split('-').map(Number);
  return new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).toISOString().slice(0, 10);
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

function validateRange(dateFrom: string, dateTo: string): string | null {
  if (!dateFrom || !dateTo) return 'Indica la fecha de inicio y la de fin.';
  if (dateFrom > dateTo) return 'La fecha de inicio no puede ser posterior a la fecha de fin.';
  if ((Date.parse(dateTo) - Date.parse(dateFrom)) / 86_400_000 >= CAPACITY_REPORT_MAX_RANGE_DAYS) {
    return `El rango no puede superar ${CAPACITY_REPORT_MAX_RANGE_DAYS} días.`;
  }
  return null;
}

export interface CapacityReportState {
  readonly search: string;
  readonly periodOptions: readonly CapacityPeriodOption[];
  /** Mes del selector "Periodo" que coincide exactamente con el rango; `''` si el rango es personalizado. */
  readonly periodStart: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  /** Mensaje si el rango no es válido — mientras lo haya, no se consulta el reporte. */
  readonly rangeError: string | null;
  readonly sort: { field: CapacityReportSortField; direction: 'asc' | 'desc' };
  readonly page: number;
  readonly pageSize: number;
  readonly query: Partial<ListCapacityReportQuery>;
  setSearch(value: string): void;
  /** Atajo: fija el rango al mes completo elegido. */
  setPeriodStart(value: string): void;
  setDateFrom(value: string): void;
  setDateTo(value: string): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  toggleSort(field: string): void;
}

/** Estado de la pestaña "Capacity" de Administración — mismo patrón que `useUsersListState`. */
export function useCapacityReportState(): CapacityReportState {
  const periodOptions = useMemo(() => buildCapacityPeriodOptions(), []);
  const initialMonth = periodOptions[0]?.value ?? '';
  const [search, setSearchState] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [dateFrom, setDateFromState] = useState(initialMonth);
  const [dateTo, setDateToState] = useState(() => (initialMonth ? monthEndOf(initialMonth) : ''));
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
    if (!value) return;
    setDateFromState(value);
    setDateToState(monthEndOf(value));
    setPage(1);
  }, []);

  const setDateFrom = useCallback((value: string) => {
    setDateFromState(value);
    setPage(1);
  }, []);

  const setDateTo = useCallback((value: string) => {
    setDateToState(value);
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

  const periodStart = useMemo(
    () => periodOptions.find((option) => option.value === dateFrom && monthEndOf(option.value) === dateTo)?.value ?? '',
    [periodOptions, dateFrom, dateTo],
  );
  const rangeError = validateRange(dateFrom, dateTo);

  const query = useMemo<Partial<ListCapacityReportQuery>>(
    () => ({
      page,
      pageSize,
      search: debouncedSearch || undefined,
      dateFrom,
      dateTo,
      sortField: sort.field,
      sortDirection: sort.direction,
    }),
    [page, pageSize, debouncedSearch, dateFrom, dateTo, sort],
  );

  return {
    search,
    periodOptions,
    periodStart,
    dateFrom,
    dateTo,
    rangeError,
    sort,
    page,
    pageSize,
    query,
    setSearch,
    setPeriodStart,
    setDateFrom,
    setDateTo,
    setPage,
    setPageSize,
    toggleSort,
  };
}
