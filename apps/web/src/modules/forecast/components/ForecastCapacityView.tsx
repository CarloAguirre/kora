import { useMemo, useState } from 'react';
import { FORECAST_ASSIGNMENT_TYPE_LABELS, type ForecastCapacityItem, type ForecastCapacityMember } from '@kora/contracts';
import styles from './ForecastCapacityView.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { KpiCard } from '@/shared/components/ui/KpiCard';
import { TextField } from '@/shared/components/ui/TextField';
import { Pagination } from '@/shared/components/ui/Pagination';
import { WeekRangePicker } from '@/shared/components/ui/WeekRangePicker';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { SearchIcon, TriangleAlertIcon } from '@/shared/components/icons/Icons';
import { useForecastCapacity } from '../api/forecast.queries';
import { currentLaborWeek } from '../lib/labor-weeks';

const PAGE_SIZE = 20;
type SortField = 'fullName' | 'teamName' | 'assignedHours' | 'loadPercent';

/** Tiempo que no es de proyecto ni soporte — en el Figma, "Capacitación" va en dorado. */
const NON_PROJECT_TYPES = new Set<ForecastCapacityItem['type']>(['vacation', 'admin_day', 'day_off', 'sick_leave', 'training', 'other']);

function itemLabel(item: ForecastCapacityItem): string {
  return item.projectName ?? FORECAST_ASSIGNMENT_TYPE_LABELS[item.type];
}

function loadTone(member: ForecastCapacityMember): 'full' | 'partial' | 'over' {
  if (member.assignedHours > member.capacityHours) return 'over';
  return member.assignedHours === member.capacityHours ? 'full' : 'partial';
}

function ProjectChips({ member }: { member: ForecastCapacityMember }) {
  const tone = loadTone(member);
  const unassigned = Math.max(0, member.capacityHours - member.assignedHours);

  return (
    <div className={styles.chips}>
      {member.items.map((item, index) => {
        const chipClass = tone === 'over' ? styles.chipOver : NON_PROJECT_TYPES.has(item.type) ? styles.chipNonProject : styles.chipProject;
        return (
          <span
            key={`${item.type}-${item.projectId ?? index}`}
            className={[styles.chip, chipClass].join(' ')}
            title={item.comments.join(' · ') || undefined}
          >
            {itemLabel(item)}: {item.hours}hh
          </span>
        );
      })}
      {unassigned > 0 && <span className={[styles.chip, styles.chipUnassigned].join(' ')}>Sin asignación: {unassigned}hh</span>}
    </div>
  );
}

function LoadBar({ member }: { member: ForecastCapacityMember }) {
  const tone = loadTone(member);
  const width = Math.min(100, Math.max(0, member.loadPercent));
  const fillClass = tone === 'over' ? styles.fillOver : tone === 'full' ? styles.fillFull : styles.fillPartial;

  return (
    <div className={styles.load}>
      <div className={styles.track}>
        <div className={[styles.fill, fillClass].join(' ')} style={{ width: `${width}%` }} />
      </div>
      <span className={styles.loadValue}>{member.loadPercent}%</span>
    </div>
  );
}

const COLUMNS: ReadonlyArray<Column<ForecastCapacityMember>> = [
  { key: 'fullName', header: 'Colaborador', sortable: true, width: '160px', render: (member) => member.fullName },
  { key: 'teamName', header: 'Equipo', sortable: true, width: '120px', render: (member) => member.teamName },
  { key: 'assignedHours', header: 'Proyectos/HH', sortable: true, render: (member) => <ProjectChips member={member} /> },
  { key: 'loadPercent', header: 'Carga', sortable: true, width: '280px', render: (member) => <LoadBar member={member} /> },
];

/**
 * Vista de solo lectura — réplica de `Forecast/index.tsx` (v1): la ve
 * admin, PMO y líderes sin equipo propio. Reemplaza el RPC
 * `get_forecast_capacity_view` + la agregación en el cliente
 * (`buildColaboradores`) por una respuesta ya agregada en el backend — ver
 * docs/DECISION-M6-FORECAST.md. Disposición según el Figma "PANTALLA
 * REFERENCIA FORECAST" (node 9449:21787).
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
    const teamCount = new Set(members.map((member) => member.teamId)).size;
    const underAssigned = members.filter((member) => member.assignedHours < member.capacityHours);
    const unassignedHours = underAssigned.reduce((sum, member) => sum + (member.capacityHours - member.assignedHours), 0);
    const totalCapacity = members.reduce((sum, member) => sum + member.capacityHours, 0);
    const totalAssigned = members.reduce((sum, member) => sum + member.assignedHours, 0);
    const availability = totalCapacity > 0 ? Math.round(((totalCapacity - totalAssigned) / totalCapacity) * 100) : 0;
    return {
      totalMembers: members.length,
      teamCount,
      underAssigned: underAssigned.length,
      unassignedHours,
      totalCapacity,
      availability,
    };
  }, [data]);

  const handleSortChange = (field: string) => {
    setSort((prev) => ({
      field: field as SortField,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  };

  return (
    <DashboardLayout title="Forecast">
      <div className={styles.page}>
        {/* El título "Forecast" del Figma ya lo pinta la TopBar; aquí solo queda el período. */}
        <div className={styles.header}>
          <WeekRangePicker
            className={styles.periodField}
            periodStart={period.periodStart}
            periodEnd={period.periodEnd}
            onChange={(next) => {
              setPeriod({ ...next, label: '' });
              setPage(1);
            }}
          />
        </div>

        <div className={styles.kpis}>
          <KpiCard
            size="lg"
            tone="info"
            label="Total colaboradores"
            value={kpis.totalMembers}
            sub={`En ${kpis.teamCount} ${kpis.teamCount === 1 ? 'equipo' : 'equipos'}`}
          />
          <KpiCard
            size="lg"
            tone="danger"
            icon={<TriangleAlertIcon size={14} />}
            label="Sin asignación"
            value={kpis.underAssigned}
            sub={`${kpis.unassignedHours} hrs. sin asignar en el período`}
          />
          <KpiCard
            size="lg"
            tone="success"
            label="Disponibilidad"
            value={`${kpis.availability}%`}
            sub={`De ${kpis.totalCapacity} hrs. de capacidad total`}
          />
        </div>

        <Card className={styles.section}>
          <h3 className={styles.sectionTitle}>Capacidad y Planificación</h3>

          <div className={styles.banner}>
            Disponibilidad global del equipo durante el período: <strong>{kpis.unassignedHours} horas libres</strong>
          </div>

          <div className={styles.searchRow}>
            <TextField
              className={styles.search}
              aria-label="Buscar por nombre, equipo, proyecto"
              type="search"
              placeholder="Buscar por nombre, equipo, proyecto"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              iconRight={<SearchIcon size={16} />}
            />
          </div>

          <DataTable
            caption="Capacidad por colaborador"
            columns={COLUMNS}
            items={pageItems}
            getRowKey={(member) => member.teamMemberId}
            loading={isLoading}
            error={error ? 'No se pudo cargar el forecast.' : null}
            emptyMessage="No hay colaboradores que coincidan con la búsqueda."
            sort={sort}
            onSortChange={handleSortChange}
          />

          <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </Card>
      </div>
    </DashboardLayout>
  );
}
