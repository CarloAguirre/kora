import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  PROJECT_PHASES,
  PROJECT_PHASE_LABELS,
  PROJECT_STATUSES,
  PROJECT_STATUS_LABELS,
  type ProjectPhase,
  type ProjectSortField,
  type ProjectStatus,
  type ProjectSummary,
} from '@kora/contracts';
import styles from './ProjectsListPage.module.css';
import { DashboardLayout } from '@/shared/components/layout/DashboardLayout';
import { Button } from '@/shared/components/ui/Button';
import { Card } from '@/shared/components/ui/Card';
import { DataTable, type Column } from '@/shared/components/ui/DataTable';
import { Pagination } from '@/shared/components/ui/Pagination';
import { TextField } from '@/shared/components/ui/TextField';
import { MultiSelect } from '@/shared/components/ui/MultiSelect';
import { Tabs } from '@/shared/components/ui/Tabs';
import { useToast } from '@/shared/components/ui/Toast';
import { ConfirmActionDialog } from '@/shared/components/ui/ConfirmActionDialog';
import { SearchIcon, PlusIcon, DownloadIcon, TrashIcon } from '@/shared/components/icons/Icons';
import { ProjectStatusBadge } from '../components/ProjectStatusBadge';
import { ProjectsSummaryChart } from '../components/ProjectsSummaryChart';
import { getProjectStageLabel } from '../lib/project-stage-display';
import { formatProgressPercent } from '../lib/project-progress-display';
import { exportDevelopmentProjects, exportSupportProjects } from '../lib/project-export';
import {
  DEFAULT_PROJECTS_SORT,
  initialProjectsListSearch,
  rememberProjectsListSearch,
  type ProjectsListSearch,
} from '../lib/projects-list-search';
import { useDeleteProject, useProjectsList } from '../api/projects.queries';
import { projectsApi } from '../api/projects.api';
import { useClientsList } from '@/modules/clients/api/clients.queries';
import { useUsersList } from '@/modules/users/api/users.queries';
import { usePermissions } from '@/modules/auth/hooks/usePermissions';
import { projectPath } from '@/app/router/paths';

const STATUS_OPTIONS = PROJECT_STATUSES.map((status) => ({ value: status, label: PROJECT_STATUS_LABELS[status] }));
const PHASE_OPTIONS = PROJECT_PHASES.map((phase) => ({ value: phase, label: PROJECT_PHASE_LABELS[phase] }));
const TABS = [
  { id: 'development', label: 'Proyectos Desarrollo' },
  { id: 'support', label: 'Soporte' },
] as const;
const SUPPORT_SUB_TABS = [
  { id: 'active', label: 'Activos' },
  { id: 'finished', label: 'Terminados' },
] as const;
const EXPORT_PAGE_SIZE = 200;

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
// Restantes y desviadas se separan: si el proyecto ya consumió todo lo vendido, restantes queda en 0
// y el exceso se muestra como desviación (nunca un número negativo).
const remainingHoursOf = (sold: number, used: number) => Math.max(sold - used, 0);
const deviationHoursOf = (sold: number, used: number) => Math.max(used - sold, 0);
// Fechas `YYYY-MM-DD` (sin hora): con `T00:00:00` se leen en hora local — `new Date('2026-09-01')` es medianoche
// UTC y en Chile se mostraba como el día anterior.
const formatDate = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
// Ancho fijo de las columnas Inicio/Fin: alcanza para "dd-mm-aaaa" + padding sin partir la fecha en dos líneas.
const DATE_COLUMN_WIDTH = '120px';

/**
 * Listado de proyectos: tabs Desarrollo/Soporte, gráfico resumen y tabla
 * completa, siguiendo la misma disposición que `Proyectos/index.tsx` en la
 * v1. La tab Desarrollo lleva los filtros Líder/Estado/Etapa/Buscar, los tres
 * primeros con selección múltiple (`MultiSelect`, checkboxes + búsqueda),
 * igual que en la v1; la tab Soporte, igual que en la v1, no lleva esos filtros — solo el
 * sub-selector Activos/Terminados y Buscar. Sin el filtro de
 * Período/Detalle del gráfico, que depende de datos que aún no existen
 * (registro de horas por fecha — M4). La creación y la ficha completa se
 * abordan en la ficha de detalle.
 */
export function ProjectsListPage() {
  const { can } = usePermissions();
  const toast = useToast();
  const location = useLocation();
  const [listSearch, setListSearch] = useState(() => initialProjectsListSearch(location.state));
  const { tab, supportSubTab, search, leaderUserIds, statuses, phases, page, pageSize, sort } = listSearch;
  const updateListSearch = (patch: Partial<ProjectsListSearch>) => setListSearch((current) => ({ ...current, ...patch }));
  const setPage = (next: number) => updateListSearch({ page: next });

  // Se guarda en cada cambio para que "Volver a proyectos" desde la ficha restaure lo que había.
  useEffect(() => {
    rememberProjectsListSearch(listSearch);
  }, [listSearch]);

  const [deleteTarget, setDeleteTarget] = useState<ProjectSummary | null>(null);
  const [exporting, setExporting] = useState(false);
  const deleteProject = useDeleteProject();

  const listQuery =
    tab === 'development'
      ? {
          type: tab,
          search: search || undefined,
          leaderUserId: leaderUserIds.length > 0 ? leaderUserIds : undefined,
          status: statuses.length > 0 ? statuses : undefined,
          phase: phases.length > 0 ? phases : undefined,
        }
      : {
          type: tab,
          search: search || undefined,
          status: [supportSubTab],
        };

  const { data, isLoading, error } = useProjectsList({
    ...listQuery,
    page,
    pageSize,
    sortField: sort.field,
    sortDirection: sort.direction,
  });
  // Totales de las sub-pestañas Activos/Terminados de Soporte: solo interesa
  // `total`, así que basta con una página de 1. Respetan el Buscar para que
  // coincidan con lo que muestra la tabla al cambiar de pestaña.
  const supportCountQuery = { type: 'support' as const, search: search || undefined, page: 1, pageSize: 1 };
  const { data: supportActiveCount } = useProjectsList(
    { ...supportCountQuery, status: ['active'] },
    { enabled: tab === 'support' },
  );
  const { data: supportFinishedCount } = useProjectsList(
    { ...supportCountQuery, status: ['finished'] },
    { enabled: tab === 'support' },
  );
  const supportSubTabs = SUPPORT_SUB_TABS.map((subTab) => {
    const total = (subTab.id === 'active' ? supportActiveCount : supportFinishedCount)?.total;
    return { id: subTab.id, label: total === undefined ? subTab.label : `${subTab.label} (${total})` };
  });
  const { data: clients } = useClientsList({ page: 1, pageSize: 200, sortField: 'companyName' });
  const { data: leaders } = useUsersList({ page: 1, pageSize: 200, sortField: 'firstName', role: 'leader' });

  const clientOptions = useMemo(
    () => (clients?.items ?? []).map((c) => ({ value: c.id, label: c.companyName })),
    [clients],
  );
  const leaderOptions = useMemo(
    () => (leaders?.items ?? []).map((u) => ({ value: u.id, label: u.fullName })),
    [leaders],
  );

  const changeTab = (id: string) =>
    updateListSearch({ tab: id as 'development' | 'support', sort: DEFAULT_PROJECTS_SORT, page: 1 });

  const changeSupportSubTab = (id: string) => updateListSearch({ supportSubTab: id as 'active' | 'finished', page: 1 });

  const toggleSort = (field: string) =>
    updateListSearch({
      sort:
        sort.field === field
          ? { field: sort.field, direction: sort.direction === 'asc' ? 'desc' : 'asc' }
          : { field: field as ProjectSortField, direction: 'asc' },
      page: 1,
    });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteProject.mutateAsync(deleteTarget.id);
    toast.success(`Se eliminó el proyecto ${deleteTarget.name}.`);
    setDeleteTarget(null);
  };

  const actionsColumn: Column<ProjectSummary> = {
    key: 'actions',
    header: 'Acciones',
    align: 'right',
    width: '70px',
    render: (project) => (
      <div className={styles.actions}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDeleteTarget(project)}
          aria-label={`Eliminar ${project.name}`}
        >
          <TrashIcon size={16} />
        </Button>
      </div>
    ),
  };
  // Sin `projects:manage` (p. ej. el líder) no hay ninguna acción disponible, así que la columna no se muestra.
  const managementColumns = can('projects:manage') ? [actionsColumn] : [];

  const renderDeviation = (deviation: number) =>
    deviation > 0 ? <span className={styles.deviated}>{formatHours(deviation)}</span> : <span className={styles.empty}>{formatHours(deviation)}</span>;

  const developmentColumns: Column<ProjectSummary>[] = [
    {
      key: 'name',
      header: 'Nombre',
      sortable: true,
      render: (p) => (
        <Link to={projectPath(p)} className={styles.link}>
          {p.name}
        </Link>
      ),
    },
    { key: 'client', header: 'Cliente', sortable: true, render: (p) => p.client?.companyName ?? <span className={styles.empty}>—</span> },
    { key: 'leader', header: 'Líder', sortable: true, render: (p) => p.leader?.fullName ?? <span className={styles.empty}>—</span> },
    { key: 'status', header: 'Estado', sortable: true, render: (p) => <ProjectStatusBadge status={p.status} /> },
    { key: 'stage', header: 'Etapa', render: (p) => getProjectStageLabel(p) },
    {
      key: 'startDate',
      header: 'Inicio',
      sortable: true,
      width: DATE_COLUMN_WIDTH,
      render: (p) => <span className={styles.date}>{formatDate(p.startDate)}</span>,
    },
    {
      key: 'endDate',
      header: 'Fin',
      sortable: true,
      width: DATE_COLUMN_WIDTH,
      render: (p) => <span className={styles.date}>{formatDate(p.endDate)}</span>,
    },
    {
      key: 'progress',
      header: '% Avance',
      sortable: true,
      render: (p) =>
        p.progress.actual != null ? formatProgressPercent(p.progress.actual) : <span className={styles.empty}>Sin plan</span>,
    },
    { key: 'soldHours', header: 'HH vendidas', sortable: true, render: (p) => formatHours(p.soldHours) },
    { key: 'usedHours', header: 'HH Consumidas', sortable: true, render: (p) => formatHours(p.usedHours) },
    { key: 'remainingHours', header: 'HH Restantes', sortable: true, render: (p) => formatHours(remainingHoursOf(p.soldHours, p.usedHours)) },
    {
      key: 'deviationHours',
      header: 'HH desviadas',
      sortable: true,
      render: (p) => renderDeviation(deviationHoursOf(p.soldHours, p.usedHours)),
    },
    ...managementColumns,
  ];

  const supportColumns: Column<ProjectSummary>[] = [
    {
      key: 'name',
      header: 'Nombre proyecto',
      sortable: true,
      render: (p) => (
        <Link to={projectPath(p)} className={styles.link}>
          {p.name}
        </Link>
      ),
    },
    { key: 'client', header: 'Cliente', sortable: true, render: (p) => p.client?.companyName ?? <span className={styles.empty}>—</span> },
    {
      key: 'supportPlan',
      header: 'Tipo de Soporte',
      sortable: true,
      render: (p) => p.supportPlanDescription || <span className={styles.empty}>—</span>,
    },
    { key: 'leader', header: 'Líder', sortable: true, render: (p) => p.leader?.fullName ?? <span className={styles.empty}>—</span> },
    { key: 'stage', header: 'Etapa', render: (p) => getProjectStageLabel(p) },
    { key: 'supportHours', header: 'HH Vendidas', sortable: true, render: (p) => formatHours(p.supportHours) },
    { key: 'usedHours', header: 'HH Consumidas', sortable: true, render: (p) => formatHours(p.usedHours) },
    { key: 'remainingHours', header: 'HH Restantes', sortable: true, render: (p) => formatHours(remainingHoursOf(p.supportHours, p.usedHours)) },
    {
      key: 'deviationHours',
      header: 'HH desviadas',
      sortable: true,
      render: (p) => renderDeviation(deviationHoursOf(p.supportHours, p.usedHours)),
    },
    ...managementColumns,
  ];

  const columns = tab === 'development' ? developmentColumns : supportColumns;

  const handleExport = async () => {
    setExporting(true);
    try {
      // La exportación usa su propio universo de datos — todos los proyectos
      // del tipo activo, sin los filtros de la tabla ni del gráfico — y se pide
      // recién al descargar. El delay artificial es para que se alcance a ver
      // el estado "Generando…" antes de que el navegador dispare la descarga.
      const [{ items }] = await Promise.all([
        projectsApi.list({ type: tab, page: 1, pageSize: EXPORT_PAGE_SIZE }),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
      if (tab === 'development') exportDevelopmentProjects(items);
      else exportSupportProjects(items);
    } finally {
      setExporting(false);
    }
  };

  return (
    <DashboardLayout title="Proyectos">
      <div className={styles.page}>
        <div className={styles.tabsRow}>
          <Tabs tabs={TABS} activeId={tab} onSelect={changeTab} />
          <div className={styles.tabsActions}>
            <Button
              variant="outlineDark"
              iconLeft={<DownloadIcon size={16} />}
              loading={exporting}
              loadingText="Generando…"
              onClick={() => void handleExport()}
            >
              Descargar {tab === 'development' ? 'Proyectos Desarrollo' : 'Soporte'}
            </Button>
            {can('projects:manage') && (
              <Link to="/proyectos/nuevo">
                <Button iconLeft={<PlusIcon size={18} />}>Crear Proyecto</Button>
              </Link>
            )}
          </div>
        </div>

        <ProjectsSummaryChart
          type={tab}
          clientOptions={clientOptions}
          showFinalizedToggle={tab === 'development'}
        />

        <Card>
          {tab === 'support' && (
            <div className={styles.supportSubTabsRow}>
              <Tabs tabs={supportSubTabs} activeId={supportSubTab} onSelect={changeSupportSubTab} />
            </div>
          )}

          <div className={styles.filters}>
            {tab === 'development' && (
              <>
                <MultiSelect
                  className={styles.filter}
                  label="Líder"
                  placeholder="Todos"
                  searchPlaceholder="Buscar líder"
                  options={leaderOptions}
                  value={leaderUserIds}
                  onChange={(next) => updateListSearch({ leaderUserIds: next, page: 1 })}
                />
                <MultiSelect
                  className={styles.filter}
                  label="Estado"
                  placeholder="Todos"
                  searchPlaceholder="Buscar estado"
                  options={STATUS_OPTIONS}
                  value={statuses}
                  onChange={(next) => updateListSearch({ statuses: next as ProjectStatus[], page: 1 })}
                />
                <MultiSelect
                  className={styles.filter}
                  label="Etapa"
                  placeholder="Todas"
                  searchPlaceholder="Buscar etapa"
                  options={PHASE_OPTIONS}
                  value={phases}
                  onChange={(next) => updateListSearch({ phases: next as ProjectPhase[], page: 1 })}
                />
              </>
            )}
            <TextField
              className={styles.search}
              label="Buscar"
              type="search"
              placeholder={tab === 'development' ? 'Buscar Proyecto' : 'Buscar por nombre'}
              value={search}
              onChange={(event) => updateListSearch({ search: event.target.value, page: 1 })}
              iconLeft={<SearchIcon size={16} />}
            />
          </div>

          <div className={styles.table}>
            <DataTable
              caption="Listado de proyectos"
              columns={columns}
              items={data?.items ?? []}
              getRowKey={(project) => project.id}
              loading={isLoading}
              error={error ? 'No se pudo cargar el listado de proyectos.' : null}
              emptyMessage="No hay proyectos que coincidan con los filtros aplicados."
              sort={sort}
              onSortChange={toggleSort}
            />
          </div>

          {data && (
            <Pagination
              page={page}
              pageCount={data.pageCount}
              total={data.total}
              pageSize={data.pageSize}
              onPageChange={setPage}
              onPageSizeChange={(size) => updateListSearch({ pageSize: size, page: 1 })}
            />
          )}
        </Card>
      </div>

      <ConfirmActionDialog
        open={deleteTarget !== null}
        title="Eliminar proyecto"
        description={deleteTarget ? `Se eliminará el proyecto ${deleteTarget.name}. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        destructive
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}
