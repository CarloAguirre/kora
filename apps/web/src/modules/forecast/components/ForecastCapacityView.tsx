import { useMemo, useState } from 'react';
import styles from './ForecastCapacityView.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { Button } from '@/shared/components/ui/Button';
import { Pagination } from '@/shared/components/ui/Pagination';
import { SearchIcon, ArrowUpDownIcon } from '@/shared/components/icons/Icons';
import type { SortState } from '@/shared/components/ui/DataTable';
import { useForecastCapacity } from '../api/forecast.queries';
import { buildLaborWeeks, currentLaborWeek } from '../lib/labor-weeks';
import { ForecastCapacityCard } from './ForecastCapacityCard';

const PAGE_SIZE = 20;
type SortField = 'fullName' | 'teamName' | 'assignedHours' | 'loadPercent';

const SORT_OPTIONS: { value: SortField; label: string }[] = [
  { value: 'fullName', label: 'Nombre' },
  { value: 'teamName', label: 'Equipo' },
  { value: 'loadPercent', label: 'Carga' },
  { value: 'assignedHours', label: 'HH asignadas' },
];

const WEEKS = buildLaborWeeks();

/**
 * Vista de solo lectura — réplica de `Forecast/index.tsx` (v1): la ve
 * admin, PMO y líderes sin equipo propio. Reemplaza el RPC
 * `get_forecast_capacity_view` + la agregación en el cliente
 * (`buildColaboradores`) por una respuesta ya agregada en el backend — ver
 * docs/DECISION-M6-FORECAST.md.
 */
export function ForecastCapacityView() {
  const [period, setPeriod] = useState(() => currentLaborWeek());
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<SortField>>({ field: 'fullName', direction: 'asc' });
  const [page, setPage] = useState(1);

  const { data, isLoading, error } = useForecastCapacity({ periodStart: period.periodStart, periodEnd: period.periodEnd });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const members = data?.members ?? [];
    if (!term) return members;
    return members.filter(
      (member) =>
        member.fullName.toLowerCase().includes(term) ||
        member.teamName.toLowerCase().includes(term) ||
        member.items.some((item) => item.projectName?.toLowerCase().includes(term)),
    );
  }, [data, search]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      const direction = sort.direction === 'asc' ? 1 : -1;
      if (sort.field === 'fullName') return a.fullName.localeCompare(b.fullName, 'es-CL') * direction;
      if (sort.field === 'teamName') return a.teamName.localeCompare(b.teamName, 'es-CL') * direction;
      if (sort.field === 'assignedHours') return (a.assignedHours - b.assignedHours) * direction;
      return (a.loadPercent - b.loadPercent) * direction;
    });
    return copy;
  }, [filtered, sort]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpis = useMemo(() => {
    const members = data?.members ?? [];
    const totalMembers = members.length;
    const unassigned = members.filter((member) => member.assignedHours < member.capacityHours).length;
    const totalCapacity = members.reduce((sum, member) => sum + member.capacityHours, 0);
    const totalAssigned = members.reduce((sum, member) => sum + member.assignedHours, 0);
    const availability = totalCapacity > 0 ? Math.round(((totalCapacity - totalAssigned) / totalCapacity) * 100) : 0;
    return { totalMembers, unassigned, availability };
  }, [data]);

  return (
    <DashboardLayout title="Forecast">
      <div className={styles.page}>
        <Select
          className={styles.periodRow}
          label="Período"
          options={WEEKS.map((week) => ({ value: `${week.periodStart}|${week.periodEnd}`, label: week.label }))}
          value={`${period.periodStart}|${period.periodEnd}`}
          onChange={(event) => {
            const [periodStart, periodEnd] = event.target.value.split('|');
            setPeriod({ periodStart: periodStart!, periodEnd: periodEnd!, label: '' });
            setPage(1);
          }}
        />

        <div className={styles.kpis}>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Total colaboradores</span>
            <span className={styles.kpiValue}>{kpis.totalMembers}</span>
          </Card>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Sin asignación completa</span>
            <span className={[styles.kpiValue, styles.kpiValueWarning].join(' ')}>{kpis.unassigned}</span>
          </Card>
          <Card className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Disponibilidad</span>
            <span className={styles.kpiValue}>{kpis.availability}%</span>
          </Card>
        </div>

        <div className={styles.toolbar}>
          <TextField
            className={styles.search}
            label="Buscar"
            type="search"
            placeholder="Colaborador, equipo o proyecto"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            iconLeft={<SearchIcon size={16} />}
          />

          <div className={styles.sortGroup}>
            <Select
              className={styles.sortField}
              label="Ordenar por"
              options={SORT_OPTIONS}
              value={sort.field}
              onChange={(event) => setSort((prev) => ({ field: event.target.value as SortField, direction: prev.direction }))}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label={sort.direction === 'asc' ? 'Cambiar a orden descendente' : 'Cambiar a orden ascendente'}
              onClick={() => setSort((prev) => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
            >
              <ArrowUpDownIcon size={16} />
            </Button>
          </div>
        </div>

        {isLoading && <p className={styles.empty}>Cargando…</p>}
        {error && <p className={styles.empty}>No se pudo cargar el forecast.</p>}
        {!isLoading && !error && pageItems.length === 0 && (
          <p className={styles.empty}>No hay colaboradores que coincidan con la búsqueda.</p>
        )}

        <div className={styles.cards}>
          {pageItems.map((member) => (
            <ForecastCapacityCard key={member.teamMemberId} member={member} />
          ))}
        </div>

        <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </DashboardLayout>
  );
}
