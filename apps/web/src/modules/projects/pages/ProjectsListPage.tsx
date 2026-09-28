import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { DataTable, type Column, type SortState } from '@/shared/components/ui/DataTable';
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
import { exportDevelopmentProjects, exportSupportProjects } from '../lib/project-export';
import { useDeleteProject, useProjectsList } from '../api/projects.queries';
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
const CHART_PAGE_SIZE = 200;

const formatHours = (value: number) => value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString('es-CL') : '—');

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
  const [tab, setTab] = useState<'development' | 'support'>('development');
  const [supportSubTab, setSupportSubTab] = useState<'active' | 'finished'>('active');
  const [search, setSearch] = useState('');
  const [leaderUserIds, setLeaderUserIds] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
  const [phases, setPhases] = useState<ProjectPhase[]>([]);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState<ProjectSortField>>({ field: 'createdAt', direction: 'desc' });
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
    pageSize: 25,
    sortField: sort.field,
    sortDirection: sort.direction,
  });
  // El gráfico y la exportación usan su propio universo de datos — todos los
  // proyectos del tipo activo, sin los filtros de la tabla (Líder/Estado/
  // Etapa/Buscar): en la v1 son estados independientes (`devChartFilterCliente`
  // aparte de `devLeaderFilters`/`devStatusFilters`), no una vista derivada
  // de la tabla.
  const { data: chartSourceData } = useProjectsList({ type: tab, page: 1, pageSize: CHART_PAGE_SIZE });
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

  const changeTab = (id: string) => {
    setTab(id as 'development' | 'support');
    setSort({ field: 'createdAt', direction: 'desc' });
    setPage(1);
  };

  const changeSupportSubTab = (id: string) => {
    setSupportSubTab(id as 'active' | 'finished');
    setPage(1);
  };

  const toggleSort = (field: string) => {
    setSort((current) =>
      current.field === field
        ? { field: current.field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field: field as ProjectSortField, direction: 'asc' },
    );
    setPage(1);
  };

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
    render: (project) =>
      can('projects:manage') ? (
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
      ) : null,
  };

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
    { key: 'stage', header: 'Etapa de avance', render: (p) => getProjectStageLabel(p) },
    { key: 'startDate', header: 'Inicio', sortable: true, render: (p) => formatDate(p.startDate) },
    { key: 'endDate', header: 'Fin', sortable: true, render: (p) => formatDate(p.endDate) },
    { key: 'progress', header: '% Avance', sortable: true, render: (p) => (p.actualProgress != null ? `${p.actualProgress}%` : '—') },
    { key: 'soldHours', header: 'HH vendidas', sortable: true, render: (p) => formatHours(p.soldHours) },
    { key: 'usedHours', header: 'HH Consumidas', sortable: true, render: (p) => formatHours(p.usedHours) },
    { key: 'remainingHours', header: 'HH Restantes', sortable: true, render: (p) => formatHours(p.soldHours - p.usedHours) },
    actionsColumn,
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
    { key: 'remainingHours', header: 'HH Restantes', sortable: true, render: (p) => formatHours(p.supportHours - p.usedHours) },
    { key: 'deviationHours', header: 'HH Desviación', sortable: true, render: (p) => formatHours(p.usedHours - p.supportHours) },
    actionsColumn,
  ];

  const columns = tab === 'development' ? developmentColumns : supportColumns;

  const handleExport = async () => {
    setExporting(true);
    try {
      // Delay artificial para que se alcance a ver el estado "Generando…"
      // antes de que el navegador dispare la descarga.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const items = chartSourceData?.items ?? [];
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
          projects={chartSourceData?.items ?? []}
          clientOptions={clientOptions}
          showFinalizedToggle={tab === 'development'}
        />

        <Card>
          {tab === 'support' && (
            <div className={styles.supportSubTabsRow}>
              <Tabs tabs={SUPPORT_SUB_TABS} activeId={supportSubTab} onSelect={changeSupportSubTab} />
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
                  onChange={(next) => {
                    setLeaderUserIds(next);
                    setPage(1);
                  }}
                />
                <MultiSelect
                  className={styles.filter}
                  label="Estado"
                  placeholder="Todos"
                  searchPlaceholder="Buscar estado"
                  options={STATUS_OPTIONS}
                  value={statuses}
                  onChange={(next) => {
                    setStatuses(next as ProjectStatus[]);
                    setPage(1);
                  }}
                />
                <MultiSelect
                  className={styles.filter}
                  label="Etapa"
                  placeholder="Todas"
                  searchPlaceholder="Buscar etapa"
                  options={PHASE_OPTIONS}
                  value={phases}
                  onChange={(next) => {
                    setPhases(next as ProjectPhase[]);
                    setPage(1);
                  }}
                />
              </>
            )}
            <TextField
              className={styles.search}
              label="Buscar"
              type="search"
              placeholder={tab === 'development' ? 'Buscar Proyecto' : 'Buscar por nombre'}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              iconLeft={<SearchIcon size={16} />}
            />
          </div>

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

          {data && (
            <Pagination page={page} pageCount={data.pageCount} total={data.total} pageSize={data.pageSize} onPageChange={setPage} />
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
