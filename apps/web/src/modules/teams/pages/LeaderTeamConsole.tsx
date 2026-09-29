import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PROJECT_STATUS_LABELS, type ProjectSummary, type TeamMember, type TeamSummary } from '@kora/contracts';
import styles from './LeaderTeamConsole.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Card } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { TextField } from '@/shared/components/ui/TextField';
import { Tabs } from '@/shared/components/ui/Tabs';
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ClockIcon, SearchIcon, TrendingUpIcon } from '@/shared/components/icons/Icons';
import { ProjectStatusBadge } from '@/modules/projects/components/ProjectStatusBadge';
import { getProjectStageLabel } from '@/modules/projects/lib/project-stage-display';
import { useProjectsList } from '@/modules/projects/api/projects.queries';
import { TeamHourHistoryPanel } from '@/modules/hours/components/TeamHourHistoryPanel';
import { TeamContextBar } from '../components/TeamContextBar';
import { projectTeamPath } from '@/app/router/paths';
import { compareSortValues, nextSortState, type SortValue } from '@/shared/lib/sort';

const PROJECT_TAB_KEYS = ['all', 'active', 'draft', 'on_hold', 'support', 'finished', 'quoted'] as const;
type ProjectTabKey = (typeof PROJECT_TAB_KEYS)[number];

const TAB_LABELS: Record<ProjectTabKey, string> = {
  all: 'Todos',
  active: 'Activos',
  draft: 'No iniciados',
  on_hold: 'Detenidos',
  support: 'Soporte',
  finished: 'Finalizados',
  quoted: 'Cotización',
};

const PAGE_SIZE = 10;
const TEAM_PROJECTS_FETCH_SIZE = 200;

const soldHoursOf = (project: ProjectSummary) => (project.type === 'support' ? project.supportHours : project.soldHours);
const deviationHoursOf = (project: ProjectSummary) => Math.max(0, project.usedHours - soldHoursOf(project));

type SortField =
  | 'name'
  | 'client'
  | 'members'
  | 'status'
  | 'stage'
  | 'startDate'
  | 'endDate'
  | 'soldHours'
  | 'usedHours'
  | 'plannedHours'
  | 'deviationHours';

/** Valor por el que se ordena cada columna — el mismo que se muestra, no el crudo (ej. el estado se ordena por su etiqueta). */
const SORT_VALUE: Record<SortField, (project: ProjectSummary) => SortValue> = {
  name: (p) => p.name,
  client: (p) => p.client?.companyName,
  members: (p) => p.assignedMemberCount,
  status: (p) => PROJECT_STATUS_LABELS[p.status],
  stage: (p) => getProjectStageLabel(p),
  // Fechas ISO 'YYYY-MM-DD': el orden de texto coincide con el cronológico.
  startDate: (p) => p.startDate,
  endDate: (p) => p.endDate,
  soldHours: soldHoursOf,
  usedHours: (p) => p.usedHours,
  plannedHours: (p) => p.plannedHours,
  deviationHours: deviationHoursOf,
};

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const formatDate = (value: string | null) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL') : '—');

function matchesTab(project: ProjectSummary, tab: ProjectTabKey): boolean {
  if (tab === 'all') return true;
  if (tab === 'support') return project.type === 'support';
  if (project.type === 'support') return false;
  if (tab === 'active') return project.status === 'active';
  if (tab === 'draft') return project.status === 'draft';
  if (tab === 'on_hold') return project.status === 'on_hold';
  if (tab === 'finished') return project.status === 'finished';
  return project.salesStage === 'quoted';
}

/**
 * Consola del líder para su(s) equipo(s) — reemplaza la vista de administración
 * de equipos que veía un líder en `/equipos` (una tabla global de equipos que
 * no le pertenecía) por el equivalente de `LiderEquiposPM`/`LiderDashboardB`
 * en la v1: `TeamContextBar` (selector de equipo + filtro por colaborador),
 * "Proyectos del equipo" con tabs por estado, y "Registro de horas Líder":
 * alta de horas propias + historial de TODO el equipo (autor, equipo, filtros
 * de persona/fecha/estado), igual que `LiderDashboardB` en la v1. La
 * capacidad semanal y la aprobación de HH del equipo sí tienen pantallas
 * propias completas en v2 (`/forecast` y `/horas/aprobaciones`) — para esas
 * dos, aquí solo se enlaza en vez de reconstruirlas.
 */
export function LeaderTeamConsole({ teams }: { teams: TeamSummary[] }) {
  const [teamId, setTeamId] = useState(teams[0]?.id ?? '');
  const activeTeam = teams.find((t) => t.id === teamId) ?? { id: teamId };
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [tab, setTab] = useState<ProjectTabKey>('all');
  const [search, setSearch] = useState('');
  // `null` = el orden en que llegan de la API, hasta que se hace clic en un encabezado.
  const [sort, setSort] = useState<SortState<SortField> | null>(null);
  const [page, setPage] = useState(1);

  const {
    data: teamProjects,
    isLoading: loadingProjects,
    error: teamProjectsError,
  } = useProjectsList(
    teamId ? { teamId, assignedToUserId: selectedMember?.userId, page: 1, pageSize: TEAM_PROJECTS_FETCH_SIZE } : {},
  );

  const allProjects = teamProjects?.items ?? [];

  const tabCounts = useMemo(() => {
    const counts: Record<ProjectTabKey, number> = { all: 0, active: 0, draft: 0, on_hold: 0, support: 0, finished: 0, quoted: 0 };
    for (const key of PROJECT_TAB_KEYS) counts[key] = allProjects.filter((p) => matchesTab(p, key)).length;
    return counts;
  }, [allProjects]);

  const filteredProjects = useMemo(() => {
    const byTab = allProjects.filter((p) => matchesTab(p, tab));
    const query = search.trim().toLowerCase();
    const bySearch = query
      ? byTab.filter((p) => [p.name, p.client?.companyName].filter(Boolean).some((value) => value!.toLowerCase().includes(query)))
      : byTab;
    if (!sort) return bySearch;
    const valueOf = SORT_VALUE[sort.field];
    return [...bySearch].sort((a, b) => compareSortValues(valueOf(a), valueOf(b), sort.direction));
  }, [allProjects, tab, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const pageItems = filteredProjects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changeTab = (id: string) => {
    setTab(id as ProjectTabKey);
    setPage(1);
  };

  const toggleSort = (field: string) => {
    setSort((prev) => nextSortState(prev, field as SortField));
    setPage(1);
  };

  const columns: Column<ProjectSummary>[] = [
    {
      key: 'name',
      header: 'Nombre',
      sortable: true,
      render: (p) => (
        <Link to={projectTeamPath(p, activeTeam)} className={styles.link}>
          {p.name}
        </Link>
      ),
    },
    { key: 'client', header: 'Cliente', sortable: true, render: (p) => p.client?.companyName ?? <span className={styles.empty}>—</span> },
    {
      key: 'members',
      header: 'Colaboradores',
      sortable: true,
      render: (p) => (p.assignedMemberCount > 0 ? p.assignedMemberCount : <span className={styles.empty}>—</span>),
    },
    { key: 'status', header: 'Estado', sortable: true, render: (p) => <ProjectStatusBadge status={p.status} /> },
    { key: 'stage', header: 'Etapa', sortable: true, render: (p) => getProjectStageLabel(p) },
    { key: 'startDate', header: 'Inicio', sortable: true, render: (p) => formatDate(p.startDate) },
    { key: 'endDate', header: 'Fin (estimado)', sortable: true, render: (p) => formatDate(p.endDate) },
    {
      key: 'soldHours',
      header: 'HH vendidas',
      align: 'right',
      sortable: true,
      render: (p) => formatHours(soldHoursOf(p)),
    },
    { key: 'usedHours', header: 'HH Consumidas', align: 'right', sortable: true, render: (p) => formatHours(p.usedHours) },
    { key: 'plannedHours', header: 'HH Planificación', align: 'right', sortable: true, render: (p) => formatHours(p.plannedHours) },
    {
      key: 'deviationHours',
      header: 'HH desviadas',
      align: 'right',
      sortable: true,
      render: (p) => {
        const deviation = deviationHoursOf(p);
        return deviation > 0 ? <span className={styles.deviated}>{formatHours(deviation)}</span> : <span className={styles.empty}>{formatHours(deviation)}</span>;
      },
    },
  ];

  return (
    <DashboardLayout title="Equipos">
      <div className={styles.page}>
        <TeamContextBar
          teams={teams}
          teamId={teamId}
          onTeamChange={(nextTeamId) => {
            setTeamId(nextTeamId);
            setSelectedMember(null);
            setPage(1);
          }}
          selectedMember={selectedMember}
          onMemberSelect={(member) => {
            setSelectedMember(member);
            setPage(1);
          }}
          actions={
            <>
              <Link to="/horas/aprobaciones">
                <Button variant="outlineDark" size="sm" iconLeft={<ClockIcon size={15} />}>
                  Registro de HH
                </Button>
              </Link>
              <Link to="/forecast">
                <Button variant="outlineDark" size="sm" iconLeft={<TrendingUpIcon size={15} />}>
                  Capacidad
                </Button>
              </Link>
            </>
          }
        />

        <Card>
          <h2 className={styles.title}>Proyectos del equipo</h2>

          <Tabs
            tabs={PROJECT_TAB_KEYS.map((key) => ({ id: key, label: `${TAB_LABELS[key]} (${tabCounts[key]})` }))}
            activeId={tab}
            onSelect={changeTab}
          />

          <TextField
            className={styles.search}
            label="Buscar"
            type="search"
            placeholder="Buscar por nombre de proyecto, cliente"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            iconLeft={<SearchIcon size={16} />}
          />

          <DataTable
            caption="Proyectos del equipo"
            columns={columns}
            items={pageItems}
            getRowKey={(project) => project.id}
            sort={sort ?? undefined}
            onSortChange={toggleSort}
            loading={loadingProjects}
            error={teamProjectsError ? 'No se pudo cargar los proyectos del equipo.' : null}
            emptyMessage="No hay proyectos para este filtro."
          />

          <Pagination page={page} pageCount={pageCount} total={filteredProjects.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </Card>

        <Card>
          <h2 className={styles.title}>Registro de horas Líder</h2>
          <TeamHourHistoryPanel teamId={teamId || undefined} userId={selectedMember?.userId} />
        </Card>
      </div>
    </DashboardLayout>
  );
}
