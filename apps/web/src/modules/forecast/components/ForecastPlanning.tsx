import { useMemo, useState, type ReactNode } from 'react';
import { FORECAST_ASSIGNMENT_TYPE_LABELS, type ForecastCapacityItem, type ForecastCapacityMember } from '@kora/contracts';
import styles from './ForecastPlanning.module.css';
import { Card } from '@/shared/components/ui/Card';
import { KpiCard } from '@/shared/components/ui/KpiCard';
import { TextField } from '@/shared/components/ui/TextField';
import { DEFAULT_PAGE_SIZE, Pagination } from '@/shared/components/ui/Pagination';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { SearchIcon, TriangleAlertIcon } from '@/shared/components/icons/Icons';

/**
 * Piezas comunes de las dos vistas de Forecast (solo lectura y líder), según
 * el Figma "PANTALLA REFERENCIA FORECAST" (fileKey Sqc5DJtmbLtnBhAM0y4Fww,
 * node 9449:21787): indicadores arriba y la tarjeta "Capacidad y
 * Planificación" con la tabla de carga por colaborador.
 */

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

function freeHours(member: ForecastCapacityMember): number {
  return Math.max(0, member.capacityHours - member.assignedHours);
}

function ProjectChips({ member }: { member: ForecastCapacityMember }) {
  const tone = loadTone(member);
  const unassigned = freeHours(member);

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

const BASE_COLUMNS: ReadonlyArray<Column<ForecastCapacityMember>> = [
  { key: 'fullName', header: 'Colaborador', sortable: true, width: '160px', render: (member) => member.fullName },
  { key: 'teamName', header: 'Equipo', sortable: true, width: '120px', render: (member) => member.teamName },
  { key: 'assignedHours', header: 'Proyectos/HH', sortable: true, render: (member) => <ProjectChips member={member} /> },
  { key: 'loadPercent', header: 'Carga', sortable: true, width: '280px', render: (member) => <LoadBar member={member} /> },
];

function summarize(members: readonly ForecastCapacityMember[]) {
  const totalCapacity = members.reduce((sum, member) => sum + member.capacityHours, 0);
  const totalAssigned = members.reduce((sum, member) => sum + member.assignedHours, 0);
  return {
    totalMembers: members.length,
    teamCount: new Set(members.map((member) => member.teamId)).size,
    underAssigned: members.filter((member) => member.assignedHours < member.capacityHours).length,
    freeHours: members.reduce((sum, member) => sum + freeHours(member), 0),
    totalCapacity,
    availability: totalCapacity > 0 ? Math.round(((totalCapacity - totalAssigned) / totalCapacity) * 100) : 0,
  };
}

/** Las tres tarjetas de indicadores sobre la tabla. */
export function ForecastKpis({ members }: { members: readonly ForecastCapacityMember[] }) {
  const kpis = useMemo(() => summarize(members), [members]);

  return (
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
        sub={`${kpis.freeHours} hrs. sin asignar en el período`}
      />
      <KpiCard
        size="lg"
        tone="success"
        label="Disponibilidad"
        value={`${kpis.availability}%`}
        sub={`De ${kpis.totalCapacity} hrs. de capacidad total`}
      />
    </div>
  );
}

export interface ForecastPlanningSectionProps {
  members: readonly ForecastCapacityMember[];
  loading?: boolean;
  error?: string | null;
  /** Acciones por fila (p. ej. "Editar" en la vista del líder); agrega una columna al final. */
  renderActions?: (member: ForecastCapacityMember) => ReactNode;
}

/** Tarjeta "Capacidad y Planificación": banner de horas libres, buscador y tabla paginada. */
export function ForecastPlanningSection({ members, loading = false, error = null, renderActions }: ForecastPlanningSectionProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState<SortField>>({ field: 'fullName', direction: 'asc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const totalFreeHours = useMemo(() => members.reduce((sum, member) => sum + freeHours(member), 0), [members]);

  const sorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? members.filter(
          (member) =>
            member.fullName.toLowerCase().includes(term) ||
            member.teamName.toLowerCase().includes(term) ||
            member.items.some((item) => item.projectName?.toLowerCase().includes(term)),
        )
      : [...members];

    const direction = sort.direction === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      if (sort.field === 'fullName') return a.fullName.localeCompare(b.fullName, 'es-CL') * direction;
      if (sort.field === 'teamName') return a.teamName.localeCompare(b.teamName, 'es-CL') * direction;
      if (sort.field === 'assignedHours') return (a.assignedHours - b.assignedHours) * direction;
      return (a.loadPercent - b.loadPercent) * direction;
    });
  }, [members, search, sort]);

  const columns = useMemo<ReadonlyArray<Column<ForecastCapacityMember>>>(
    () =>
      renderActions
        ? [...BASE_COLUMNS, { key: 'actions', header: '', align: 'right', width: '96px', render: renderActions }]
        : BASE_COLUMNS,
    [renderActions],
  );

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Al cambiar de período o equipo la lista puede achicarse; no dejamos la página fuera de rango.
  const currentPage = Math.min(page, pageCount);
  const pageItems = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSortChange = (field: string) => {
    setSort((prev) => ({
      field: field as SortField,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
    setPage(1);
  };

  return (
    <Card className={styles.section}>
      <h3 className={styles.sectionTitle}>Capacidad y Planificación</h3>

      <div className={styles.banner}>
        Disponibilidad global del equipo durante el período: <strong>{totalFreeHours} horas libres</strong>
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
        columns={columns}
        items={pageItems}
        getRowKey={(member) => member.teamMemberId}
        loading={loading}
        error={error}
        emptyMessage={members.length === 0 ? 'No hay colaboradores activos en este período.' : 'No hay colaboradores que coincidan con la búsqueda.'}
        sort={sort}
        onSortChange={handleSortChange}
      />

      <Pagination
        page={currentPage}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </Card>
  );
}
