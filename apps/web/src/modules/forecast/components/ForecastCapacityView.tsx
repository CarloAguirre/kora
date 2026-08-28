import { useMemo, useState } from 'react';
import type { ForecastCapacityMember } from '@kora/contracts';
import styles from './ForecastCapacityView.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Select } from '@/shared/components/ui/Select';
import { TextField } from '@/shared/components/ui/TextField';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { SearchIcon } from '@/shared/components/icons/Icons';
import { useForecastCapacity } from '../api/forecast.queries';
import { buildLaborWeeks, currentLaborWeek } from '../lib/labor-weeks';

const PAGE_SIZE = 20;
type SortField = 'fullName' | 'teamName' | 'assignedHours' | 'loadPercent';

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

  const columns: Column<ForecastCapacityMember>[] = [
    { key: 'fullName', header: 'Colaborador', sortable: true, render: (m) => m.fullName },
    { key: 'teamName', header: 'Equipo', sortable: true, render: (m) => m.teamName },
    { key: 'items', header: 'Proyectos / HH', render: (m) => <ProjectBadges member={m} /> },
    { key: 'loadPercent', header: 'Carga', sortable: true, render: (m) => <LoadBar percent={m.loadPercent} /> },
  ];

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

        <Card>
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

          <DataTable
            caption="Capacidad de forecast por colaborador"
            columns={columns}
            items={pageItems}
            getRowKey={(m) => m.teamMemberId}
            loading={isLoading}
            error={error ? 'No se pudo cargar el forecast.' : null}
            emptyMessage="No hay colaboradores que coincidan con la búsqueda."
            sort={sort}
            onSortChange={(field) => {
              setSort((prev) =>
                prev.field === field ? { field: field as SortField, direction: prev.direction === 'asc' ? 'desc' : 'asc' } : { field: field as SortField, direction: 'asc' },
              );
            }}
          />

          <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </Card>
      </div>
    </DashboardLayout>
  );
}

function ProjectBadges({ member }: { member: ForecastCapacityMember }) {
  if (member.items.length === 0) {
    return <span className={styles.empty}>Sin asignación</span>;
  }

  return (
    <div className={styles.projectBadges}>
      {member.items.map((item, index) => (
        <span
          key={`${item.type}-${item.projectId ?? index}`}
          className={[styles.projectBadge, item.type === 'training' ? styles.projectBadgeWarning : ''].filter(Boolean).join(' ')}
          title={item.comments.join(' · ')}
        >
          {item.projectName ?? typeLabel(item.type)} · {item.hours}h
        </span>
      ))}
    </div>
  );
}

function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    vacation: 'Vacaciones',
    admin_day: 'Día administrativo',
    day_off: 'Día libre',
    sick_leave: 'Licencia médica',
    training: 'Capacitación',
    other: 'Otros',
  };
  return labels[type] ?? type;
}

function LoadBar({ percent }: { percent: number }) {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <div className={styles.loadCell}>
      <div className={styles.loadTrack}>
        <div
          className={[styles.loadFill, percent === 100 ? styles.loadFillFull : ''].filter(Boolean).join(' ')}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={styles.loadLabel}>{percent}%</span>
    </div>
  );
}
